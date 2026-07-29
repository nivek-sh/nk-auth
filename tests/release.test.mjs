import assert from "node:assert/strict";
import test from "node:test";
import {
    compareVersions,
    findHighestVersion,
    getStableBaseVersion,
    normalizeBaseVersion,
    resolveReleaseBaseVersion,
    resolveReleaseVersion,
} from "../scripts/release-version.mjs";

test("normalizes stable base versions with an optional v prefix", () => {
    assert.equal(normalizeBaseVersion("v1.2.3"), "1.2.3");
    assert.equal(normalizeBaseVersion("1.2.3"), "1.2.3");
    assert.throws(() => normalizeBaseVersion("v1.2.3-alpha.0"), /stable base version/);
});

test("derives a stable base from the current package version", () => {
    assert.equal(getStableBaseVersion("0.0.1-alpha.4"), "0.0.1");
    assert.equal(getStableBaseVersion("v2.3.4-beta.8"), "2.3.4");
    assert.equal(getStableBaseVersion("5.6.7"), "5.6.7");
});

test("uses the current package base for an implicit prerelease", () => {
    assert.equal(
        resolveReleaseBaseVersion({
            currentVersion: "0.0.1-alpha.4",
            channel: "alpha",
        }),
        "0.0.1",
    );
    assert.equal(
        resolveReleaseBaseVersion({
            requestedVersion: "v0.0.2",
            currentVersion: "0.0.1-alpha.4",
            channel: "beta",
        }),
        "0.0.2",
    );
    assert.throws(
        () =>
            resolveReleaseBaseVersion({
                currentVersion: "0.0.1-alpha.4",
            }),
        /required for a stable release/,
    );
});

test("compares stable and prerelease versions using SemVer precedence", () => {
    assert.equal(compareVersions("0.0.1", "0.0.1-beta.9"), 1);
    assert.equal(compareVersions("0.0.1-beta.0", "0.0.1-alpha.99"), 1);
    assert.equal(compareVersions("0.0.1-alpha.10", "0.0.1-alpha.9"), 1);
    assert.equal(compareVersions("1.0.0+build.2", "1.0.0+build.1"), 0);
});

test("finds the highest published version", () => {
    assert.equal(
        findHighestVersion(["0.0.1-alpha.0", "0.0.1-beta.0", "0.0.2-alpha.0"]),
        "0.0.2-alpha.0",
    );
});

test("increments the alpha counter for the requested base version", () => {
    assert.deepEqual(
        resolveReleaseVersion({
            baseVersion: "v0.0.1",
            channel: "alpha",
            publishedVersions: ["0.0.1-alpha.0", "0.0.1-alpha.4"],
        }),
        {
            version: "0.0.1-alpha.5",
            highestPublishedVersion: "0.0.1-alpha.4",
        },
    );
});

test("starts a new prerelease channel at zero", () => {
    assert.deepEqual(
        resolveReleaseVersion({
            baseVersion: "v0.0.2",
            channel: "beta",
            publishedVersions: ["0.0.1"],
        }),
        {
            version: "0.0.2-beta.0",
            highestPublishedVersion: "0.0.1",
        },
    );
});

test("increments the beta counter independently from alpha releases", () => {
    assert.deepEqual(
        resolveReleaseVersion({
            baseVersion: "v0.0.2",
            channel: "beta",
            publishedVersions: ["0.0.2-alpha.8", "0.0.2-beta.0", "0.0.2-beta.2"],
        }),
        {
            version: "0.0.2-beta.3",
            highestPublishedVersion: "0.0.2-beta.2",
        },
    );
});

test("uses the exact stable version when no channel is selected", () => {
    assert.deepEqual(
        resolveReleaseVersion({
            baseVersion: "v0.0.2",
            publishedVersions: ["0.0.2-beta.3"],
        }),
        {
            version: "0.0.2",
            highestPublishedVersion: "0.0.2-beta.3",
        },
    );
});

test("rejects a release that is not newer than every published version", () => {
    assert.throws(
        () =>
            resolveReleaseVersion({
                baseVersion: "v0.0.1",
                channel: "alpha",
                publishedVersions: ["0.0.1-beta.0"],
            }),
        /must be newer/,
    );
    assert.throws(
        () =>
            resolveReleaseVersion({
                baseVersion: "v0.0.1",
                publishedVersions: ["0.0.1"],
            }),
        /must be newer/,
    );
});
