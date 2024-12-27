#!/usr/bin/env node

import { checkbox, search } from "@inquirer/prompts";
import directoryTree from "directory-tree";
import fs from "fs";
import fuzzysort from "fuzzysort";
import nodemon from "nodemon";
import YAML from "yaml";

// calling esbuild
// node ./${esbuild.js filename} --dir {artifacts_directory}

const artifacts_directory = `${process.cwd()}/.aws-sam/build`;
console.log(artifacts_directory);

// parse template.yaml to extract lambda functions
const file = fs.readFileSync("./template.yaml", "utf8");
const yaml = YAML.parse(file, { logLevel: "error" });
const functionNames = [];
Object.entries(yaml.Resources).forEach(([k, v]) => {
  if (v.Type === "AWS::Serverless::Function") {
    functionNames.push(k);
  }
});

// select lambda functions to hot-reload
const answer = await checkbox({
  message: "which functions do you want to watch for hot-reload?",
  choices: [...functionNames.map((f) => ({ value: f }))],
  required: true,
});

// directory tree for the project
const t = directoryTree("./", { exclude: /node_modules/ }).children.map(
  (e) => e.path
);

// path of esbuild file
const esbuildPath = await search({
  message: "esbuild path",
  source: async (input, { signal }) => {
    if (!input) {
      return [];
    }

    const results =
      fuzzysort.go(input, t)?.map((e) => ({ value: e.target })) ?? [];

    return results;
  },
});

const commands = answer.map(
  (a) => `node ./${esbuildPath} --dir ${artifacts_directory}/${a}`
);

// start nodemon
nodemon({ exec: commands.join("; "), ext: "js ts" });

nodemon.on("restart", (files) => {
  console.log("app restarted due to: ", files);
});
