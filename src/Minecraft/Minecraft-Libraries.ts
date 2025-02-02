/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

import os from 'os';
import fs from 'fs';
import AdmZip from 'adm-zip';
import nodeFetch from 'node-fetch';

let MojangLib = { win32: "windows", darwin: "osx", linux: "linux" };
let Arch = { x32: "32", x64: "64", arm: "32", arm64: "64" };

export default class Libraries {
    json: any;
    options: any;
    constructor(options: any) {
        this.options = options;
    }

    async Getlibraries(json: any) {
        this.json = json;
        let libraries = [];

        for (let lib of this.json.libraries) {
            let artifact: any;
            let type = "Libraries";

            if (lib.natives) {
                let classifiers = lib.downloads.classifiers;
                let native = lib.natives[MojangLib[process.platform]];
                if (!native) native = lib.natives[process.platform];
                type = "Native";
                if (native) artifact = classifiers[native.replace("${arch}", Arch[os.arch()])];
                else continue;
            } else {
                if (lib.rules && lib.rules[0].os) {
                    if (lib.rules[0].os.name !== MojangLib[process.platform]) continue;
                }
                artifact = lib.downloads.artifact;
            }
            if (!artifact) continue;
            libraries.push({
                sha1: artifact.sha1,
                size: artifact.size,
                path: `libraries/${artifact.path}`,
                type: type,
                url: artifact.url
            });
        }

        let clientjar = this.json.downloads.client;
        libraries.push({
            sha1: clientjar.sha1,
            size: clientjar.size,
            path: `versions/${this.json.id}/${this.json.id}.jar`,
            type: "Libraries",
            url: clientjar.url
        });

        libraries.push({
            path: `versions/${this.json.id}/${this.json.id}.json`,
            type: "CFILE",
            content: JSON.stringify(this.json)
        });
        return libraries;
    }

    async GetAssetsOthers(url: any) {
        if (!url) return [];
        let data = await nodeFetch(url).then(res => res.json());

        let assets = [];
        for (let asset of data) {
            if (!asset.path) continue
            let path = asset.path;
            assets.push({
                sha1: asset.hash,
                size: asset.size,
                type: path.split("/")[0],
                path: this.options.instance ? `${this.options.path}/instances/${this.options.instance}/${path}` : path,
                url: asset.url
            });
        }
        return assets
    }

    async natives(bundle: any) {
        let natives = bundle.filter(mod => mod.type === "Native").map(mod => `${mod.path}`);
        if (natives.length === 0) return natives;
        let nativeFolder = (`${this.options.path}/versions/${this.json.id}/natives`).replace(/\\/g, "/");
        if (!fs.existsSync(nativeFolder)) fs.mkdirSync(nativeFolder, { recursive: true, mode: 0o777 });

        for (let native of natives) {
            let zip = new AdmZip(native);
            let entries = zip.getEntries();
            for (let entry of entries) {
                if (entry.entryName.startsWith("META-INF")) continue;
                if (entry.isDirectory) {
                    fs.mkdirSync(`${nativeFolder}/${entry.entryName}`, { recursive: true, mode: 0o777 });
                    continue
                }
                fs.writeFile(`${nativeFolder}/${entry.entryName}`, zip.readFile(entry), { encoding: "utf8", mode: 0o777 }, () => { });
            }
        }
        return natives;
    }

    async checkFiles(bundle: any) {
        let instancePath = ''
        let instanceFolder = []
        if (this.options.instance) {
            if (!fs.existsSync(`${this.options.path}/instances`)) fs.mkdirSync(`${this.options.path}/instances`, { recursive: true });
            instancePath = `/instances/${this.options.instance}`
            instanceFolder = fs.readdirSync(`${this.options.path}/instances`).filter(dir => dir != this.options.instance)
        }
        let files = this.getFiles(this.options.path);
        let ignoredfiles = [...this.getFiles(`${this.options.path}/loader`)]

        for (let instances of instanceFolder) {
            ignoredfiles.push(...this.getFiles(`${this.options.path}/instances/${instances}`));
        }

        for (let file of this.options.ignored) {
            file = (`${this.options.path}${instancePath}/${file}`)
            if (fs.existsSync(file)) {
                if (fs.statSync(file).isDirectory()) {
                    ignoredfiles.push(...this.getFiles(file));
                } else if (fs.statSync(file).isFile()) {
                    ignoredfiles.push(file);
                }
            }
        }

        ignoredfiles.forEach(file => this.options.ignored.push((file)));
        bundle.forEach(file => ignoredfiles.push((file.path)));
        files = files.filter(file => ignoredfiles.indexOf(file) < 0);

        for (let file of files) {
            try {
                if (fs.statSync(file).isDirectory()) {
                    fs.rmdirSync(file);
                } else {
                    fs.unlinkSync(file);
                    let folder = file.split("/").slice(0, -1).join("/");
                    while (true) {
                        if (folder == this.options.path) break;
                        let content = fs.readdirSync(folder);
                        if (content.length == 0) fs.rmdirSync(folder);
                        folder = folder.split("/").slice(0, -1).join("/");
                    }
                }
            } catch (e) {
                continue;
            }
        }
    }

    getFiles(path: any, file = []) {
        if (fs.existsSync(path)) {
            let files = fs.readdirSync(path);
            if (files.length == 0) file.push(path);
            for (let i in files) {
                let name = `${path}/${files[i]}`;
                if (fs.statSync(name).isDirectory()) this.getFiles(name, file);
                else file.push(name);
            }
        }
        return file;
    }
}