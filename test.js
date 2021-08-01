import test from 'bron';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import sinon from 'sinon';
import sh from 'shelljs';
import tmp from 'tmp';
import { factory, runTasks } from 'release-it/test/util';
import Plugin from './index.js';

sh.config.silent = true;

const mkTmpDir = () => {
  const dir = tmp.dirSync({ prefix: 'conventional-changelog-' });
  return dir.name;
};

const namespace = 'conventional-changelog';
const preset = 'angular';
const infile = 'CHANGES.md';
const git = { tagName: '${version}' };

const add = (type, file) => {
  sh.ShellString(file).toEnd(file);
  sh.exec(`git add ${file}`);
  sh.exec(`git commit -m "${type}(${file}): ${type} ${file}"`);
};

const setup = () => {
  const dir = mkTmpDir();
  sh.pushd(dir);
  sh.exec(`git init .`);
  add('fix', 'foo');
  return { dir };
};

test('should not throw', async () => {
  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await assert.doesNotReject(runTasks(plugin));
});

test('should set changelog using recommended bump (minor)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('feat', 'baz');

  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { changelog } = plugin.config.getContext();
  assert.match(
    changelog,
    /# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*baz:\*\* feat baz [0-9a-f]{7}/
  );
  sh.popd();
});

test('should set changelog using recommended bump (patch)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('fix', 'baz');

  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { changelog } = plugin.config.getContext();
  assert.match(
    changelog,
    /# \[1\.0\.1\]\(\/compare\/1\.0\.0\.\.\.1\.0\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\* \*\*baz:\*\* fix baz [0-9a-f]{7}/
  );
  sh.popd();
});

test('should ignore recommended bump (option)', async () => {
  setup();
  add('feat', 'baz');

  const options = { [namespace]: { preset, ignoreRecommendedBump: true }, git };
  const plugin = factory(Plugin, { namespace, options });
  const spy = sinon.spy(plugin, 'generateChangelog');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(spy.callCount, 2);
  assert.equal(version, '1.0.1');
  spy.restore();
});

test('should ignore recommended bump (prelease)', async () => {
  setup();

  const options = { preRelease: 'alpha', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '1.0.1-alpha.0');
});

test('should ignore recommended bump (prelease continuation)', async () => {
  setup();

  const options = { preRelease: 'alpha', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.0.1-alpha.0');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '1.0.1-alpha.1');
  stub.restore();
});

test('should ignore recommended bump (next prelease)', async () => {
  setup();

  const options = { preRelease: 'beta', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.0.1-alpha.1');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '1.0.1-beta.0');
  stub.restore();
});

test('should use recommended bump (from prelease)', async () => {
  setup();

  const options = { [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.0.1-beta.0');
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '1.0.1');
  stub.restore();
});

test('should use provided increment', async () => {
  setup();

  const options = { increment: 'major', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '2.0.0');
});

test('should use provided version', async () => {
  setup();

  const options = { increment: '1.2.3', [namespace]: { preset }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const { version } = plugin.config.getContext();
  assert.equal(version, '1.2.3');
});

test(`should write and update infile (${infile})`, async () => {
  const { dir } = setup();
  add('feat', 'bar');

  const f = path.join(dir, infile);
  const options = { [namespace]: { preset, infile: f }, git };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const changelog = fs.readFileSync(f);
  assert.match(
    changelog.toString(),
    /# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*foo:\*\* fix foo [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*bar:\*\* feat bar [0-9a-f]{7}/
  );
  {
    const options = { [namespace]: { preset, infile: f }, git };
    const plugin = factory(Plugin, { namespace, options });
    sh.exec(`git tag 1.1.0`);
    const stub = sinon.stub(plugin, 'getLatestVersion').returns('1.1.0');

    add('fix', 'bar');
    add('fix', 'baz');

    await runTasks(plugin);
    const changelog = fs.readFileSync(f);

    assert.match(
      changelog.toString(),
      /## \[1\.1\.1\]\(\/compare\/1\.1\.0\.\.\.1\.1\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\* \*\*baz:\*\* fix baz [0-9a-f]{7}\n\n# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*foo:\*\* fix foo [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*bar:\*\* feat bar [0-9a-f]{7}/
    );

    stub.restore();
  }
});

test('should reject if conventional bump passes error', async () => {
  setup();

  const options = { [namespace]: { preset: 'what?' }, git };
  const plugin = factory(Plugin, { namespace, options });
  await assert.rejects(
    runTasks(plugin),
    'Error: Unable to load the "what?" preset package. Please make sure it\'s installed.'
  );
});

test('should reject if conventional changelog has error', async () => {
  const options = { [namespace]: { preset: () => {} }, git };
  const plugin = factory(Plugin, { namespace, options });
  await assert.rejects(runTasks(plugin), /preset must be string or object with key name/);
});

test('should not write infile in dry run', async () => {
  const { dir } = setup();
  const infile = path.join(dir, 'DRYRUN.md');
  const options = { 'dry-run': true, [namespace]: { preset, infile }, git };
  const plugin = factory(Plugin, { namespace, options });
  const spy = sinon.spy(plugin, 'writeChangelog');
  await runTasks(plugin);
  assert.equal(spy.callCount, 0);
  assert.throws(() => fs.readFileSync(infile), /no such file/);
});
