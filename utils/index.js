"use strict";

const fs = require("fs");
var osmread = require("./node_modules/osm-read/osm-read-pbf");

let latMin = 37.708;
let latMax = 37.815;
let lonMin = -122.526;
let lonMax = -122.354;

let nodeMap = new Map();
let wayMap = new Map();

// Find all open street map *nodes* that are within our bounds
function localFilterNodes() {
    osmread.parse({
        filePath: "norcal-latest.osm.pbf",
        endDocument: function() {
            console.log("document end");
            console.log("nodes: " + nodeMap.size);
            const sfNodes = JSON.stringify(Object.fromEntries(nodeMap));
            fs.writeFileSync("sfNodes.json", sfNodes);
        },
        node: function(node) {
            let lat = parseFloat(node.lat);
            let lon = parseFloat(node.lon);
            if (lat < latMin) return;
            if (lat > latMax) return;
            if (lon < lonMin) return;
            if (lon > lonMax) return;
            let s = JSON.stringify(node);
            // if (s.toLowerCase().includes("supermarket")) console.log('node: ' + s);
            nodeMap.set(node.id, node);
        },
        // way: function(way){
        //     console.log('way: ' + JSON.stringify(way));
        // },
        // relation: function(relation){
        //     // let lat = parseFloat(node.lat);
        //     // let lon = parseFloat(node.lon);
        //     // if (lat < 37.44034) return;
        //     // if (lat > 37.45255) return;
        //     // if (lon < -122.16916) return;
        //     // if (lon > -122.14545) return;
        //     console.log('relation: ' + JSON.stringify(relation));
        // },
        error: function(msg) {
            console.error("error: " + msg);
            throw msg;
        },
    });
}

function loadJSON(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

// Find all open street map *ways* that are within our bounds - needs nodes to be loaded first.
function localFilterWays() {
    osmread.parse({
        filePath: "norcal-latest.osm.pbf",
        endDocument: function() {
            console.log("document end");
            console.log("ways: " + wayMap.size);
            const localWays = JSON.stringify(Object.fromEntries(wayMap));
            fs.writeFileSync("sfWays.json", localWays);
        },
        way: function(way) {
            let nodeRefs = way.nodeRefs;
            let inBounds = true;
            for (const node of nodeRefs) {
                //if (!nodeMap.has(node)) inBounds = false;
                if (!nodeMap.has(node)) return;
            }
            //console.log("way: " + JSON.stringify(way));
            wayMap.set(way.id, way);
        },
        error: function(msg) {
            console.error("error: " + msg);
            throw msg;
        },
    });
}

// Filter out all nodes and ways from a certain area (lat/lon)
localFilterNodes();
// nodeMap = loadJSON("./sfNodes.json");
localFilterWays();

// Find all supermarkets in our region
// let allPlaces = [];
// nodeMap = loadJSON("./sfNodes.json");
// for (const [id, val] of nodeMap) {
//     let ts = JSON.stringify(val.tags);
//     if (ts.includes("supermarket")) {
//         let lat = parseFloat(val.lat);
//         let lon = parseFloat(val.lon);
//         allPlaces.push([lat, lon, val.tags.name]);
//         // console.log(val);
//     }
// }
// console.log("----------------------------------------------------");
// // console.log(nodeMap.get("26819236"));
// wayMap = loadJSON("./sfWays.json");
// for (const [id, val] of wayMap) {
//     let ts = JSON.stringify(val.tags);
//     if (ts.includes("supermarket")) {
//         // console.log(val.nodeRefs[0]);
//         let reffed = nodeMap.get(val.nodeRefs[0]);
//         // console.log(reffed);
//         let lat = parseFloat(reffed.lat);
//         let lon = parseFloat(reffed.lon);
//         allPlaces.push([lat, lon, val.tags.name]);
//         // console.log(val);
//     }
// }
// const localWays = JSON.stringify(Object.fromEntries(wayMap));
// fs.writeFileSync("sfSupermarkets.json", JSON.stringify(allPlaces));

// ------------------- Just for reference -------------------
let nodeExample = {
    id: "293632937",
    lat: 37.7767382,
    lon: -122.3942265,
    tags: {
        "addr:city": "San Francisco",
        "addr:housenumber": "298",
        "addr:postcode": "94107",
        "addr:street": "King Street",
        brand: "Safeway",
        "brand:wikidata": "Q1508234",
        "brand:wikipedia": "en:Safeway Inc.",
        designation: "Safeway 2606",
        name: "Safeway",
        opening_hours: "Su-Sa 05:00-24:00",
        ref: "2606",
        shop: "supermarket",
        website: "https://local.safeway.com/ca/san-francisco-2606.html",
        wheelchair: "yes",
    },
    version: 7,
    timestamp: 1566779175000,
    changeset: 0,
    uid: "0",
    user: "",
};

let wayExample = {
    "id": "6322990",
    "tags": {
        "highway": "residential",
        "tiger:cfcc": "A41",
        "tiger:tlid": "125073442",
        "tiger:county": "Alameda, CA",
        "tiger:source": "tiger_import_dch_v0.6_20070809",
        "tiger:reviewed": "no",
        "tiger:separated": "no",
        "tiger:upload_uuid": "bulk_upload.pl-9d5e179e-e488-4300-b71d-b0a82eacb273",
    },
    "nodeRefs": [
        "52998740",
        "52998743",
        "52998744",
        "52998746",
        "52998748",
        "52998750",
        "52998752",
        "52998753",
        "1667624566",
        "52998756",
    ],
    "version": 2,
    "timestamp": 1331315914000,
    "changeset": 0,
    "user": "",
};
