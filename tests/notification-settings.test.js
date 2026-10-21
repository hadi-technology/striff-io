import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choosesNoRepos,
  formFromApi,
  isDirty,
  saveBody,
  showsAdminControls,
} from "../src/lib/notificationSettings.js";

const answer = {
  enabled: true,
  scope: "REPOS",
  repos: ["acme/a", "acme/b"],
  unsubscribedAll: false,
  installationEnabled: true,
  defaultForNewRepos: false,
  canManageInstallation: false,
};

test("the form shows what the API said", () => {
  assert.deepEqual(formFromApi(answer), {
    enabled: true,
    scope: "REPOS",
    repos: ["acme/a", "acme/b"],
    installationEnabled: true,
    defaultForNewRepos: false,
  });
});

test("someone who unsubscribed from everything shows as off", () => {
  assert.equal(formFromApi({ ...answer, unsubscribedAll: true }).enabled, false);
});

test("a missing answer falls back to all repositories, off, installation on", () => {
  assert.deepEqual(formFromApi({}), {
    enabled: false, scope: "ALL", repos: [], installationEnabled: true, defaultForNewRepos: false,
  });
});

test("admin controls are shown only when the API says the user may manage the installation", () => {
  assert.equal(showsAdminControls(answer), false);
  assert.equal(showsAdminControls({ ...answer, canManageInstallation: true }), true);
  assert.equal(showsAdminControls({ ...answer, canManageInstallation: "true" }), false);
  assert.equal(showsAdminControls(undefined), false);
});

test("a save is offered only once something changed, in any order of repositories", () => {
  const saved = formFromApi(answer);
  assert.equal(isDirty({ ...saved, repos: ["acme/b", "acme/a"] }, saved), false);
  assert.equal(isDirty({ ...saved, repos: ["acme/a"] }, saved), true);
  assert.equal(isDirty({ ...saved, enabled: false }, saved), true);
  assert.equal(isDirty({ ...saved, scope: "ALL" }, saved), true);
  assert.equal(isDirty({ ...saved, defaultForNewRepos: true }, saved), true);
  assert.equal(isDirty({ ...saved, installationEnabled: false }, saved), true);
});

test("repositories kept under All do not count as a change", () => {
  const saved = { ...formFromApi(answer), scope: "ALL" };
  assert.equal(isDirty({ ...saved, repos: ["acme/x"] }, saved), false);
});

test("a save sends the repositories only under the chosen-repositories scope", () => {
  const form = formFromApi(answer);
  assert.deepEqual(saveBody(7, form, false), {
    installation_id: 7, enabled: true, scope: "REPOS", repos: ["acme/a", "acme/b"],
  });
  assert.deepEqual(saveBody(7, { ...form, scope: "ALL" }, false).repos, []);
});

test("a save carries the installation-wide fields only for an admin", () => {
  const form = { ...formFromApi(answer), installationEnabled: false, defaultForNewRepos: true };
  const plain = saveBody(7, form, false);
  assert.ok(!("installationEnabled" in plain) && !("defaultForNewRepos" in plain));
  const admin = saveBody(7, form, true);
  assert.equal(admin.installationEnabled, false);
  assert.equal(admin.defaultForNewRepos, true);
});

test("choosing repositories and ticking none is called out", () => {
  const form = formFromApi(answer);
  assert.equal(choosesNoRepos({ ...form, repos: [] }), true);
  assert.equal(choosesNoRepos({ ...form, repos: [], enabled: false }), false);
  assert.equal(choosesNoRepos({ ...form, repos: [], scope: "ALL" }), false);
});
