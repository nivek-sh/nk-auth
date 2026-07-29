const BASE_VERSION_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_PATTERN =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(version) {
    const match = VERSION_PATTERN.exec(version);
    if (!match) {
        throw new TypeError(`Invalid semantic version: ${version}`);
    }

    const prerelease = match[4]?.split(".") ?? [];
    for (const identifier of prerelease) {
        if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")) {
            throw new TypeError(`Invalid semantic version: ${version}`);
        }
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease,
    };
}

function compareIdentifiers(left, right) {
    const leftIsNumber = /^\d+$/.test(left);
    const rightIsNumber = /^\d+$/.test(right);

    if (leftIsNumber && rightIsNumber) {
        return Number(left) - Number(right);
    }
    if (leftIsNumber) {
        return -1;
    }
    if (rightIsNumber) {
        return 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeBaseVersion(version) {
    const match = BASE_VERSION_PATTERN.exec(version);
    if (!match) {
        throw new TypeError(
            `--version must be a stable base version such as v0.0.2 or 0.0.2; received ${version}`,
        );
    }
    return `${match[1]}.${match[2]}.${match[3]}`;
}

export function getStableBaseVersion(version) {
    const candidate = version.startsWith("v") ? version.slice(1) : version;
    const parsed = parseVersion(candidate);
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function resolveReleaseBaseVersion({ requestedVersion, currentVersion, channel }) {
    if (requestedVersion !== undefined) {
        return normalizeBaseVersion(requestedVersion);
    }
    if (channel === "alpha" || channel === "beta") {
        return getStableBaseVersion(currentVersion);
    }

    throw new TypeError("--version is required for a stable release");
}

export function compareVersions(leftVersion, rightVersion) {
    const left = parseVersion(leftVersion);
    const right = parseVersion(rightVersion);

    for (const field of ["major", "minor", "patch"]) {
        const difference = left[field] - right[field];
        if (difference !== 0) {
            return Math.sign(difference);
        }
    }

    if (left.prerelease.length === 0 && right.prerelease.length === 0) {
        return 0;
    }
    if (left.prerelease.length === 0) {
        return 1;
    }
    if (right.prerelease.length === 0) {
        return -1;
    }

    const identifierCount = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < identifierCount; index += 1) {
        const leftIdentifier = left.prerelease[index];
        const rightIdentifier = right.prerelease[index];

        if (leftIdentifier === undefined) {
            return -1;
        }
        if (rightIdentifier === undefined) {
            return 1;
        }

        const difference = compareIdentifiers(leftIdentifier, rightIdentifier);
        if (difference !== 0) {
            return Math.sign(difference);
        }
    }

    return 0;
}

export function findHighestVersion(versions) {
    return versions.reduce((highest, version) => {
        if (highest === undefined || compareVersions(version, highest) > 0) {
            return version;
        }
        return highest;
    }, undefined);
}

export function resolveReleaseVersion({ baseVersion, channel, publishedVersions }) {
    const normalizedBaseVersion = normalizeBaseVersion(baseVersion);
    if (channel !== undefined && channel !== "alpha" && channel !== "beta") {
        throw new TypeError(`Unsupported prerelease channel: ${channel}`);
    }

    let version = normalizedBaseVersion;
    if (channel) {
        const prefix = `${normalizedBaseVersion}-${channel}.`;
        const previousCounters = publishedVersions
            .filter((publishedVersion) => publishedVersion.startsWith(prefix))
            .map((publishedVersion) => {
                const counter = publishedVersion.slice(prefix.length);
                return /^\d+$/.test(counter) ? Number(counter) : -1;
            })
            .filter((counter) => counter >= 0);
        const nextCounter = previousCounters.length === 0 ? 0 : Math.max(...previousCounters) + 1;
        version = `${prefix}${nextCounter}`;
    }

    const highestPublishedVersion = findHighestVersion(publishedVersions);
    if (
        highestPublishedVersion !== undefined &&
        compareVersions(version, highestPublishedVersion) <= 0
    ) {
        throw new RangeError(
            `Resolved version ${version} must be newer than the highest published version ${highestPublishedVersion}`,
        );
    }

    return {
        version,
        highestPublishedVersion,
    };
}
