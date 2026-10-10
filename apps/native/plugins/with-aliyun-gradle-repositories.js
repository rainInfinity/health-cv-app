'use strict';

const {
  withProjectBuildGradle,
  withSettingsGradle,
} = require('expo/config-plugins');

const ALIYUN_REPOSITORIES = [
  {
    name: 'AliyunGradlePlugin',
    url: 'https://maven.aliyun.com/repository/gradle-plugin',
  },
  {
    name: 'AliyunGoogle',
    url: 'https://maven.aliyun.com/repository/google',
  },
  {
    name: 'AliyunPublic',
    url: 'https://maven.aliyun.com/repository/public',
  },
];

function renderMavenRepository(repository, indentation, lineEnding) {
  const innerIndentation = `${indentation}  `;
  return [
    `${indentation}maven {`,
    `${innerIndentation}name = '${repository.name}'`,
    `${innerIndentation}url = '${repository.url}'`,
    `${indentation}}`,
  ].join(lineEnding);
}

function findClosingBrace(contents, start, indentation) {
  const escapedIndentation = indentation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const closingBrace = new RegExp(`^${escapedIndentation}\\}[ \\t\\r]*$`, 'm');
  const match = closingBrace.exec(contents.slice(start));
  return match ? start + match.index : -1;
}

function prependMissingRepositories(contents, bodyStart, bodyEnd, indentation, lineEnding) {
  const body = contents.slice(bodyStart, bodyEnd);
  const missing = ALIYUN_REPOSITORIES.filter(({ url }) => !body.includes(url));
  if (missing.length === 0) return contents;

  const blocks = missing
    .map((repository) => renderMavenRepository(repository, indentation, lineEnding))
    .join(lineEnding);
  return `${contents.slice(0, bodyStart)}${lineEnding}${blocks}${contents.slice(bodyStart)}`;
}

function addSettingsRepositories(contents) {
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const pluginManagement = /^([ \t]*)pluginManagement\s*\{/m.exec(contents);
  if (!pluginManagement) {
    throw new Error('无法在 Android settings.gradle 中定位 pluginManagement 块。');
  }

  const managementIndentation = pluginManagement[1];
  const managementBodyStart = pluginManagement.index + pluginManagement[0].length;
  const managementEnd = findClosingBrace(contents, managementBodyStart, managementIndentation);
  if (managementEnd < 0) {
    throw new Error('无法定位 Android settings.gradle 中 pluginManagement 块的结束位置。');
  }

  const managementBody = contents.slice(managementBodyStart, managementEnd);
  const repositories = /^([ \t]*)repositories\s*\{/m.exec(managementBody);
  if (repositories) {
    const repositoriesIndentation = repositories[1];
    const repositoriesBodyStart = managementBodyStart + repositories.index + repositories[0].length;
    const repositoriesEnd = findClosingBrace(contents, repositoriesBodyStart, repositoriesIndentation);
    if (repositoriesEnd < 0) {
      throw new Error('无法定位 Android pluginManagement repositories 块的结束位置。');
    }
    return prependMissingRepositories(
      contents,
      repositoriesBodyStart,
      repositoriesEnd,
      `${repositoriesIndentation}  `,
      lineEnding
    );
  }

  const repositoriesIndentation = `${managementIndentation}  `;
  const entryIndentation = `${repositoriesIndentation}  `;
  const entries = [
    ...ALIYUN_REPOSITORIES.map((repository) =>
      renderMavenRepository(repository, entryIndentation, lineEnding)
    ),
    `${entryIndentation}google()`,
    `${entryIndentation}mavenCentral()`,
    `${entryIndentation}gradlePluginPortal()`,
  ];
  const repositoriesBlock = [
    `${repositoriesIndentation}repositories {`,
    ...entries,
    `${repositoriesIndentation}}`,
  ].join(lineEnding);

  return `${contents.slice(0, managementBodyStart)}${lineEnding}${repositoriesBlock}${contents.slice(managementBodyStart)}`;
}

function addProjectRepositories(contents) {
  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const repositoryBlocks = [...contents.matchAll(/^([ \t]*)repositories\s*\{/gm)];
  if (repositoryBlocks.length < 2) {
    throw new Error(
      `无法在 Android build.gradle 中定位 buildscript 和 allprojects repositories 块（找到 ${repositoryBlocks.length} 个）。`
    );
  }

  let updated = contents;
  for (const match of repositoryBlocks.reverse()) {
    const repositoriesIndentation = match[1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findClosingBrace(updated, bodyStart, repositoriesIndentation);
    if (bodyEnd < 0) {
      throw new Error('无法定位 Android repositories 块的结束位置。');
    }
    updated = prependMissingRepositories(
      updated,
      bodyStart,
      bodyEnd,
      `${repositoriesIndentation}  `,
      lineEnding
    );
  }

  return updated;
}

function addSubprojectBuildscriptRepositories(contents) {
  const marker = '// 为原生子项目的 buildscript 配置 Maven 镜像。';
  if (contents.includes(marker)) return contents;

  const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
  const repositories = ALIYUN_REPOSITORIES.map(({ name, url }) =>
    [
      '  project.buildscript.repositories.maven {',
      `    name = '${name}'`,
      `    url = '${url}'`,
      '  }',
    ].join(lineEnding)
  );
  const block = [
    marker,
    'gradle.beforeProject { project ->',
    ...repositories,
    '}',
  ].join(lineEnding);

  return `${contents.replace(/\s*$/, '')}${lineEnding}${lineEnding}${block}${lineEnding}`;
}

function withAliyunGradleRepositories(config) {
  config = withSettingsGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error(
        `Aliyun Gradle 镜像插件仅支持 Groovy settings.gradle，当前为 ${modConfig.modResults.language}。`
      );
    }
    modConfig.modResults.contents = addSubprojectBuildscriptRepositories(
      addSettingsRepositories(modConfig.modResults.contents)
    );
    return modConfig;
  });

  return withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error(
        `Aliyun Gradle 镜像插件仅支持 Groovy build.gradle，当前为 ${modConfig.modResults.language}。`
      );
    }
    modConfig.modResults.contents = addProjectRepositories(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withAliyunGradleRepositories;
