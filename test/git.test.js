const git = require("@cardstack/git/service");
const process = require("child_process");
const expect = require("expect");
const { writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const tmp = require("tmp");
const { promisify } = require("util");
const logger = require('@cardstack/logger');

logger.configure({
  defaultLevel: 'warn'
});

const exec = promisify(process.exec);

async function setup() {
  let tmpDir = tmp.dirSync().name;

  await exec(`cd ${tmpDir} && git init`);

  return {
    path: tmpDir,
    exec: cmd => exec(`cd ${tmpDir} && ${cmd}`)
  };
}

describe("repository", () => {
  describe("cloning a remote", () => {
    let repo, remote;
    beforeEach(async () => {
      remote = await setup();

      writeFileSync(join(remote.path, "name"), "taras");
      await remote.exec("git add name");
      await remote.exec('git commit -m "Added name file"');

      repo = await git.getRepo(remote.path, { url: `file://${remote.path}`});
    });

    it('has different working directory than remote', () => {
      expect(remote.path).not.toBe(repo.workdir());
    });

    it("clone the remote repo", () => {
      expect(existsSync(join(repo.workdir(), 'name'))).toBe(true);
    });
  });
});
