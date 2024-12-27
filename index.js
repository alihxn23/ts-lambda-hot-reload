#!/usr/bin/env node

import { checkbox, input, search } from "@inquirer/prompts";
import fs from "fs";
import nodemon from "nodemon";
import YAML from "yaml";

// calling esbuild
// node ./${esbuild.js filename} --dir {artifacts_directory}

// artifacts directory: ${pwd}/.aws-sam/build/${FunctionName}
const artifacts_directory = `${process.cwd()}/.aws-sam/build`;
console.log(artifacts_directory);

const file = fs.readFileSync("./template.yaml", "utf8");
const yaml = YAML.parse(file, { logLevel: "error" });
const functionNames = [];
Object.entries(yaml.Resources).forEach(([k, v]) => {
  if (v.Type === "AWS::Serverless::Function") {
    functionNames.push(k);
  }
});
// console.log(functionNames);

const answer = await checkbox({
  message: "which functions do you want to watch for hot-reload?",
  choices: [...functionNames.map((f) => ({ value: f }))],
  required: true,
});

const esbuildPath = await input({ message: "esbuild path", required: true });
console.log("esbuild path", esbuildPath);

// console.log("answer", answer);

const commands = answer.map(
  (a) => `node ./esbuild.js --dir ${artifacts_directory}/${a}`
);
console.log("commands", commands);

// nodemon({ exec: commands.join("; ") });

// nodemon.on("restart", (files) => {
//   console.log("app restarted due to: ", files);
// });
