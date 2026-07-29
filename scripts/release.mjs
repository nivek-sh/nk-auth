import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolveReleaseBaseVersion, resolveReleaseVersion } from "./release-version.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function commandLabel(command, args) {
    return [command, ...args].join(" ");
}

function execute(command, args, { capture = false, acceptedStatuses = [0] } = {}) {
    const result = spawnSync(command, args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: process.env,
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (result.error) {
        throw result.error;
    }
    if (!acceptedStatuses.includes(result.status)) {
        const detail = capture ? result.stderr.trim() : "";
        throw new Error(
            `Command failed: ${commandLabel(command, args)}${detail ? `\n${detail}` : ""}`,
        );
    }

    return {
        status: result.status,
        stdout: capture ? result.stdout.trimEnd() : "",
    };
}

function executeJson(command, args) {
    const output = execute(command, args, { capture: true }).stdout;
    try {
        return JSON.parse(output);
    } catch {
        throw new Error(`Command returned invalid JSON: ${commandLabel(command, args)}`);
    }
}

function readPackageManifest() {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
}

function getLatestVersion(packageName, registry) {
    return executeJson("npm", [
        "view",
        `${packageName}@latest`,
        "version",
        "--json",
        `--registry=${registry}`,
    ]);
}

function getPublishedVersions(packageName, registry) {
    const versions = executeJson("npm", [
        "view",
        packageName,
        "versions",
        "--json",
        `--registry=${registry}`,
    ]);
    if (typeof versions === "string") {
        return [versions];
    }
    if (!Array.isArray(versions) || !versions.every((version) => typeof version === "string")) {
        throw new Error(`npm returned an invalid version list for ${packageName}`);
    }
    return versions;
}

function printUsage() {
    console.log(`Usage:
  pnpm release (--alpha | --beta) [--dry-run] [--yes]
  pnpm release --version v0.0.2 [--alpha | --beta] [--dry-run] [--yes]

Examples:
  pnpm release --alpha
  pnpm release --beta
  pnpm release --version v0.0.2 --alpha
  pnpm release --version v0.0.1

Options:
  --version <version>  Override the stable base version; required for a stable release
  --alpha              Increment alpha for the current package base version
  --beta               Increment beta for the current package base version
  --dry-run            Resolve and validate the release without changing Git
  --yes                Skip the interactive confirmation
  --help                Show this help`);
}

function parseOptions() {
    return parseArgs({
        allowPositionals: false,
        strict: true,
        options: {
            version: { type: "string" },
            alpha: { type: "boolean", default: false },
            beta: { type: "boolean", default: false },
            "dry-run": { type: "boolean", default: false },
            yes: { type: "boolean", default: false },
            help: { type: "boolean", default: false },
        },
    }).values;
}

function assertCleanWorkingTree() {
    const status = execute("git", ["status", "--porcelain", "--untracked-files=all"], {
        capture: true,
    }).stdout;
    if (status) {
        throw new Error(
            `The working tree must be clean before releasing. Commit or stash these changes:\n${status}`,
        );
    }
}

function inspectGitState(tag) {
    const branch = execute("git", ["branch", "--show-current"], { capture: true }).stdout;
    if (!branch) {
        throw new Error("Releases cannot be created from a detached HEAD");
    }
    if (branch !== "master") {
        throw new Error(`Releases must be created from master; current branch is ${branch}`);
    }

    execute("git", ["fetch", "--quiet", "origin", branch]);

    const counts = execute(
        "git",
        ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`],
        { capture: true },
    )
        .stdout.split(/\s+/)
        .map(Number);
    const [ahead, behind] = counts;
    if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
        throw new Error(`Unable to compare ${branch} with origin/${branch}`);
    }
    if (behind > 0) {
        throw new Error(
            `${branch} is behind origin/${branch} by ${behind} commit(s). Pull before releasing.`,
        );
    }

    const localTag = execute("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
        capture: true,
        acceptedStatuses: [0, 1],
    });
    if (localTag.status === 0) {
        throw new Error(`Git tag ${tag} already exists locally`);
    }

    const remoteTag = execute("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], {
        capture: true,
    }).stdout;
    if (remoteTag) {
        throw new Error(`Git tag ${tag} already exists on origin`);
    }

    return { branch, ahead };
}

async function confirmRelease(version, skipConfirmation) {
    if (skipConfirmation) {
        return true;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Interactive confirmation is unavailable. Pass --yes to continue.");
    }

    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await prompt.question(`Release ${version} and push its Git tag? [y/N] `);
        return /^(?:y|yes)$/i.test(answer.trim());
    } finally {
        prompt.close();
    }
}

function createRelease({ version, branch, packageName, registry, baseVersion, channel }) {
    const tag = `v${version}`;

    execute("pnpm", ["check"]);

    const refreshedRelease = resolveReleaseVersion({
        baseVersion,
        channel,
        publishedVersions: getPublishedVersions(packageName, registry),
    });
    if (refreshedRelease.version !== version) {
        throw new Error(
            `npm changed during validation. Expected ${version}, but the next version is now ${refreshedRelease.version}. Run the release command again.`,
        );
    }

    execute("pnpm", ["version", version, "--no-git-tag-version"]);
    execute("git", ["add", "package.json", "pnpm-lock.yaml"]);

    const stagedFiles = execute("git", ["diff", "--cached", "--name-only"], {
        capture: true,
    })
        .stdout.split("\n")
        .filter(Boolean);
    const unexpectedFiles = stagedFiles.filter(
        (file) => file !== "package.json" && file !== "pnpm-lock.yaml",
    );
    if (stagedFiles.length === 0 || unexpectedFiles.length > 0) {
        throw new Error(`Unexpected staged release files: ${stagedFiles.join(", ") || "(none)"}`);
    }

    execute("git", ["commit", "-m", `release: ${tag}`]);
    execute("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

    try {
        execute("git", [
            "push",
            "--atomic",
            "origin",
            `HEAD:refs/heads/${branch}`,
            `refs/tags/${tag}`,
        ]);
    } catch (error) {
        throw new Error(
            `${error.message}\nThe release commit and tag remain local. Retry with:\n` +
                `git push --atomic origin HEAD:refs/heads/${branch} refs/tags/${tag}`,
        );
    }
}

async function main() {
    const options = parseOptions();
    if (options.help) {
        printUsage();
        return;
    }
    if (options.alpha && options.beta) {
        throw new Error("--alpha and --beta are mutually exclusive");
    }

    const manifest = readPackageManifest();
    const channel = options.alpha ? "alpha" : options.beta ? "beta" : undefined;
    const registry = manifest.publishConfig?.registry ?? "https://registry.npmjs.org";
    const latestVersion = getLatestVersion(manifest.name, registry);

    if (!options.version && !channel) {
        throw new Error(
            `--version is required for a stable release. Current published latest for ${manifest.name}: ${latestVersion}`,
        );
    }

    const publishedVersions = getPublishedVersions(manifest.name, registry);
    const baseVersion = resolveReleaseBaseVersion({
        requestedVersion: options.version,
        currentVersion: manifest.version,
        channel,
    });
    const release = resolveReleaseVersion({
        baseVersion,
        channel,
        publishedVersions,
    });
    const tag = `v${release.version}`;

    assertCleanWorkingTree();
    const git = inspectGitState(tag);

    console.log(`Package:           ${manifest.name}`);
    console.log(`Published latest:  ${latestVersion}`);
    console.log(`Highest published: ${release.highestPublishedVersion}`);
    console.log(`Base version:      ${baseVersion}`);
    console.log(`Release version:   ${release.version}`);
    console.log(`Distribution tag:  ${channel ?? "latest"}`);
    console.log(`Git tag:           ${tag}`);
    if (git.ahead > 0) {
        console.log(`Local commits:     ${git.ahead} commit(s) ahead of origin/master`);
    }

    if (options["dry-run"]) {
        console.log("Dry run complete. No files, commits, tags, or remote refs were changed.");
        return;
    }

    if (!(await confirmRelease(release.version, options.yes))) {
        console.log("Release cancelled.");
        return;
    }

    createRelease({
        version: release.version,
        branch: git.branch,
        packageName: manifest.name,
        registry,
        baseVersion,
        channel,
    });
    console.log(
        `Release ${release.version} pushed. GitHub Actions will publish it to npm after validation.`,
    );
}

main().catch((error) => {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
});
