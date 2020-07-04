// This runs all the preprocess commands
var shell = require('shelljs');

var assert = require("assert");

function exec(cmd) {
    console.log("================ " + cmd + " ================");
    let code = shell.exec(cmd).code;
    assert(code == 0);
    return code;
}

let big = process.argv.includes("-big");

shell.cd('utils');
assert(shell.pwd().stdout.endsWith("utils"));

exec('node findMapBounds.js');
if (big) exec('node --max-old-space-size=8192 openstreetmapFilter.js');
else exec('node openstreetmapFilter.js');
exec('node geotiff.js');
if (big) exec('node --max-old-space-size=8192 processBuildings.js');
else exec('node processBuildings.js');
exec('node processPeople.js');

shell.cd('..');
