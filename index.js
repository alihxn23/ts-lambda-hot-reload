#!/usr/bin/env node
import { checkbox } from "@inquirer/prompts";
import { exec } from "child_process";
import { buildSync } from "esbuild";
import fs from "fs";
import nodemon from "nodemon";
import { exit } from "process";
import YAML from "yaml";

// calling esbuild
// node ./${esbuild.js filename} --dir {artifacts_directory}

const artifacts_directory = `${process.cwd()}/.aws-sam/build`;
// console.log(artifacts_directory);

// parse template.yaml to extract lambda functions
const file = fs.readFileSync("./template.yaml", "utf8");
const yaml = YAML.parse(file, { logLevel: "error" });
// const functionNames = [];
const functions = [];
Object.entries(yaml.Resources).forEach(([k, v]) => {
  if (v.Type === "AWS::Serverless::Function") {
    // functionNames.push(k);
    functions.push({ ...v, Name: k });
  }
});

// select lambda functions to hot-reload
const answer = await checkbox({
  message: "which functions do you want to watch for hot-reload?",
  choices: [...functions.map((f) => ({ value: f.Name }))],
  required: true,
});

const functionsToBuild = functions.filter((f) => answer.includes(f.Name));

function buildTheThings() {
  for (let f of functionsToBuild) {
    const { BuildMethod: buildMethod, BuildProperties: buildProperties } =
      f.Metadata;

    if (buildMethod === "esbuild") {
      // convert keys to camelCase
      let a = {};
      Object.keys(buildProperties).forEach((k) => {
        a[k.charAt(0).toLowerCase() + k.slice(1)] = buildProperties[k];
      });
      buildSync({
        ...a,
        entryPoints: a.entryPoints.map((e) => `${f.Properties.CodeUri}${e}`),
        outdir: `${artifacts_directory}/${f.Name}`,
      });
    } else if (buildMethod === "makefile") {
      exec(`make build-${f.Name}`, (err, stdout, stderr) => {
        if (err) {
          console.error(`exec error: ${err}`);
          exit()
        }
        console.log(`make output: ${stdout}`);
      })
    } else {
      console.log("build method not supported");
    }
  }
}

// TODO: if function properties are in globals, merge globals with function properties
// TODO: cdk

// directory tree for the project
// const t = directoryTree("./", { exclude: /node_modules/ }).children.map(
//   (e) => e.path
// );

// path of esbuild file
// const esbuildPath = await search({
//   message: "esbuild path",
//   source: async (input, { signal }) => {
//     if (!input) {
//       return [];
//     }

//     const results =
//       fuzzysort.go(input, t)?.map((e) => ({ value: e.target })) ?? [];

//     return results;
//   },
// });

// const commands = answer.map(
//   (a) => `node ./${esbuildPath} --dir ${artifacts_directory}/${a}`
// );

// start nodemon
// nodemon({ exec: commands.join("; "), ext: "js ts" });
nodemon({ exec: "echo", ext: "js ts" });

nodemon.on("start", () => {
  console.log("building...");
  buildTheThings();
  console.log("build complete!");
});

// nodemon.on("restart", (files) => {
//   console.log("app restarted due to: ", files);
// });
