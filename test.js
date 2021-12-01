import test from 'bron';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import sh from 'shelljs';
import tmp from 'tmp';
import runTasks from 'release-it';

sh.config.silent = true;

const noop = () => {};
const log = {
  log: noop,
  error: noop,
  verbose: noop,
  info: noop,
  obtrusive: noop,
  exec: noop,
  warn: noop,
  preview: noop
};

const namespace = 'conventional-changelog';
const { pathname } = new URL('./index.js', import.meta.url);
const preset = 'angular';

const getOptions = options => [
  {
    ci: true,
    'disable-metrics': true,
    git: {
      commit: false,
      tag: false,
      push: false,
      requireUpstream: false
    },
    plugins: { [pathname]: [namespace, options] }
  },
  { log }
];

const mkTmpDir = () => {
  const dir = tmp.dirSync({ prefix: namespace });
  return dir.name;
};

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

test('should generate changelog using recommended bump (minor)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('feat', 'baz');

  const options = getOptions({ preset });
  const { changelog } = await runTasks(...options);
  assert.match(
    changelog,
    /# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*baz:\*\* feat baz [0-9a-f]{7}/
  );
});

test('should generate changelog using recommended bump (patch)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('fix', 'baz');

  const options = getOptions({ preset });
  const { changelog } = await runTasks(...options);
  assert.match(
    changelog,
    /# \[1\.0\.1\]\(\/compare\/1\.0\.0\.\.\.1\.0\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\* \*\*baz:\*\* fix baz [0-9a-f]{7}/
  );
});

test('should support tag prefix', async () => {
  setup();

  sh.exec(`git tag next-2.0.0`);
  add('fix', 'bar');

  const [config, container] = getOptions({ preset });
  config.git.tagName = 'next-${version}';
  const { changelog } = await runTasks(config, container);
  assert.match(
    changelog,
    /# \[2\.0\.1\]\(\/compare\/next-2\.0\.0\.\.\.next-2\.0\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}/
  );
});

test('should respect --no-increment and return previous, identical changelog', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('fix', 'baz');
  sh.exec(`git tag 1.0.1`);

  const [config, container] = getOptions({ preset });
  config.increment = false;
  const { changelog } = await runTasks(config, container);
  assert.match(
    changelog,
    /# \[1\.0\.1\]\(\/compare\/1\.0\.0\.\.\.1\.0\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\* \*\*baz:\*\* fix baz [0-9a-f]{7}/
  );
});

test('should ignore recommended bump (option)', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('feat', 'baz');

  const options = getOptions({ preset, ignoreRecommendedBump: true });
  const { version } = await runTasks(...options);
  assert.equal(version, '1.0.1');
});

test('should ignore recommended bump for pre-release', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.0.1-alpha.0');
});

test('should ignore recommended bump for pre-release continuation', async () => {
  setup();
  sh.exec(`git tag 1.0.1-alpha.0`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.0.1-alpha.1');
});

test('should ignore recommended bump for next pre-release id', async () => {
  setup();
  sh.exec(`git tag 1.0.1-alpha.1`);

  const [config, container] = getOptions({ preset });
  config.preRelease = 'beta';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.0.1-beta.0');
  sh.popd();
});

test('should use recommended bump from pre-release', async () => {
  setup();
  sh.exec(`git tag 1.0.1-beta.0`);
  add('feat', 'baz');

  const options = getOptions({ preset });
  const { version } = await runTasks(...options);
  assert.equal(version, '1.1.0');
  sh.popd();
});

test('should use provided increment', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);

  const [config, container] = getOptions({ preset });
  config.increment = 'major';
  const { version } = await runTasks(config, container);
  assert.equal(version, '2.0.0');
});

test('should use provided version (ignore recommended bump)', async () => {
  setup();

  const [config, container] = getOptions({ preset });
  config.increment = '1.2.3';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.2.3');
});

test(`should write and update infile`, async () => {
  const { dir } = setup();
  sh.exec(`git tag 1.0.0`);
  add('fix', 'foo');
  add('feat', 'bar');

  const infile = path.join(dir, 'CHANGES.md');
  const [config, container] = getOptions({ preset, infile });
  config.git.tag = true;
  await runTasks(config, container);
  const changelog = fs.readFileSync(infile);
  assert.match(
    changelog.toString(),
    /# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*foo:\*\* fix foo [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*bar:\*\* feat bar [0-9a-f]{7}/
  );

  {
    add('fix', 'bar');
    add('fix', 'baz');

    const options = getOptions({ preset, infile });
    await runTasks(...options);
    const changelog = fs.readFileSync(infile);

    assert.match(
      changelog.toString(),
      /## \[1\.1\.1\]\(\/compare\/1\.1\.0\.\.\.1\.1\.1\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*bar:\*\* fix bar [0-9a-f]{7}\n\* \*\*baz:\*\* fix baz [0-9a-f]{7}\n\n# \[1\.1\.0\]\(\/compare\/1\.0\.0\.\.\.1\.1\.0\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\n\n\* \*\*foo:\*\* fix foo [0-9a-f]{7}\n\n\n### Features\n\n\* \*\*bar:\*\* feat bar [0-9a-f]{7}/
    );
  }
});

test('should reject if conventional bump passes error', async () => {
  setup();
  const options = getOptions({ preset: 'what?' });
  await assert.rejects(
    runTasks(...options),
    'Error: Unable to load the "what?" preset package. Please make sure it\'s installed.'
  );
});

test('should reject if conventional changelog has error', async () => {
  setup();
  const options = getOptions({ preset: () => {} });
  await assert.rejects(runTasks(...options), /preset must be string or object with key name/);
});

test('should not write infile in dry run', async () => {
  const { dir } = setup();
  const infile = path.join(dir, 'DRYRUN.md');
  const [config, container] = getOptions({ preset, infile });
  config['dry-run'] = true;
  await runTasks(config, container);
  assert.throws(() => fs.readFileSync(infile), /no such file/);
});

test('should pass only parserOpts', async t => {
  conventionalChangelog.resetHistory();
  const parserOpts = {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  };
  const options = { [namespace]: { preset, parserOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  });
  assert.deepStrictEqual(args[4], undefined);
});

test('should pass only writerOpts', async t => {
  conventionalChangelog.resetHistory();
  const writerOpts = {
    groupBy: 'scope'
  };
  const options = { [namespace]: { preset, writerOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], undefined);
  assert.deepStrictEqual(args[4], {
    groupBy: 'scope'
  });
});

test('should pass parserOpts and writerOpts', async t => {
  conventionalChangelog.resetHistory();
  const parserOpts = {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  };
  const writerOpts = {
    groupBy: 'type'
  };
  const options = { [namespace]: { preset, parserOpts, writerOpts } };
  const plugin = factory(Plugin, { namespace, options });
  await runTasks(plugin);
  const args = conventionalChangelog.args[0];
  assert.deepStrictEqual(args[0], { releaseCount: 1, preset: 'angular', tagPrefix: '' });
  assert.deepStrictEqual(args[1], { version: '1.1.0', currentTag: null, previousTag: undefined });
  assert.deepStrictEqual(args[2], { debug: null });
  assert.deepStrictEqual(args[3], {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  });
  assert.deepStrictEqual(args[4], {
    groupBy: 'type'
  });
});
