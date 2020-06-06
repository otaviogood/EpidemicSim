"use strict";
var assert = require("assert");
const fs = require("fs");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);
var turf = require("@turf/turf");
const papa = require("papaparse");
// const { curly } = require("node-libcurl");
// var path = require('path');
// var tls = require('tls');

const misc = require("./misc");
const mapBounds = require("./mapBounds");

function acronymToFullName(acronym) {
    let json = {
        AZ: "Arizona",
        AL: "Alabama",
        AK: "Alaska",
        AR: "Arkansas",
        CA: "California",
        CO: "Colorado",
        CT: "Connecticut",
        DC: "District of Columbia",
        DE: "Delaware",
        FL: "Florida",
        GA: "Georgia",
        HI: "Hawaii",
        ID: "Idaho",
        IL: "Illinois",
        IN: "Indiana",
        IA: "Iowa",
        KS: "Kansas",
        KY: "Kentucky",
        LA: "Louisiana",
        ME: "Maine",
        MD: "Maryland",
        MA: "Massachusetts",
        MI: "Michigan",
        MN: "Minnesota",
        MS: "Mississippi",
        MO: "Missouri",
        MT: "Montana",
        NE: "Nebraska",
        NV: "Nevada",
        NH: "New Hampshire",
        NJ: "New Jersey",
        NM: "New Mexico",
        NY: "New York",
        NC: "North Carolina",
        ND: "North Dakota",
        OH: "Ohio",
        OK: "Oklahoma",
        OR: "Oregon",
        PA: "Pennsylvania",
        RI: "Rhode Island",
        SC: "South Carolina",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        UT: "Utah",
        VT: "Vermont",
        VA: "Virginia",
        WA: "Washington",
        WV: "West Virginia",
        WI: "Wisconsin",
        WY: "Wyoming",
        AS: "American Samoa",
        GU: "Guam",
        MP: "Northern Mariana Islands",
        PR: "Puerto Rico",
        VI: "U.S. Virgin Islands",
        UM: "U.S. Minor Outlying Islands",
    };
    if (json[acronym] != null) {
        return json[acronym];
    }
    return acronym;
}

papa.parsePromise = function(csvString) {
    return new Promise(function(complete, error) {
        papa.parse(csvString, {
            complete: complete,
            error: error,
            delimiter: ",",
        });
    });
};

class CountyInfo {
    relevantCountyPolygons = new Map();
    censusInfo = new Map();

    async readCensusCSV(countyName, stateAbbr, countyIndex) {
        let stateName = acronymToFullName(stateAbbr);
        console.log("Reading census data for: " + countyName + ", " + stateName);
        if (!this.censusInfo.has(countyIndex)) this.censusInfo.set(countyIndex, new Map());

        let mashedName = (countyName + stateName).toLowerCase().replace(/ /g, "");
        let censusFileName = "../sourceData/QuickFacts_" + mashedName + ".csv"; // lower case and remove spaces

        // // Load data from census website if it's not cached on our disk
        // if (!fs.existsSync("tempCache/")) fs.mkdirSync("tempCache/");
        // let mashedName = (countyName + stateName).toLowerCase().replace(/ /g, "");
        // let censusFileName = "tempCache/QuickFacts_" + mashedName + ".csv"; // lower case and remove spaces
        // let url = "http://www.census.gov/quickfacts/fact/csv/" + mashedName + "/HCN010212";
        // console.log(url);
        // if (!fs.existsSync(censusFileName)) {
        //     try {
        //         // Do some wacky stuff from here: https://github.com/JCMais/node-libcurl/blob/HEAD/COMMON_ISSUES.md
        //         const certFilePath = path.join(__dirname, "cert.pem");
        //         const tlsData = tls.rootCertificates.join("\n");
        //         fs.writeFileSync(certFilePath, tlsData);

        //         const { statusCode, data, headers } = await curly.get(url, {
        //             caInfo: certFilePath,
        //             // verbose: true,
        //             httpHeader: ['Content-type: text/csv; charset=utf-8'],
        //             acceptEncoding: 'gzip, deflate, br',
        //         });
        //         console.log(data);
        //     } catch (err) {
        //         console.error(err);
        //     }
        // }

        // From: https://www.census.gov/quickfacts/fact/table/sanfranciscocountycalifornia/HCN010212
        const csvString = fs.readFileSync(censusFileName, "utf8");
        let csvResult = await papa.parsePromise(csvString);
        csvResult = csvResult.data;
        assert(csvResult[0].length == 4); // Should be only one county per CSV otherwise, we have problems.
        let factIndex = csvResult[0].indexOf("Fact");
        let valueIndex = csvResult[0].indexOf(countyName + ", " + stateName);
        assert(valueIndex > 0);
        for (let i = 1; i < csvResult.length; i++) {
            let fact = csvResult[i][factIndex];
            if (fact.includes("Population estimates,")) {
                let intValue = parseInt(csvResult[i][valueIndex].replace(/,/g, "")); // remove commas so the int can parse
                this.censusInfo.get(countyIndex).set("population", intValue);
            } else if (fact.includes("Persons per household")) {
                let floatValue = parseFloat(csvResult[i][valueIndex]);
                this.censusInfo.get(countyIndex).set("personsPerHousehold", floatValue);
            }
        }
    }

    // Make a dictionary (Map) of points and which counties they are in.
    // Takes lon, lat order
    // returns lon, lat order.
    async findCountiesForPointList(pointList) {
        console.log("Loading county boundaries");
        let pointToCounty = new Map();
        let ourCounties = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[0]);
        let ourStates = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[1]);
        // County data from here: https://public.opendatasoft.com/explore/dataset/us-county-boundaries/export/?q=santa+clara
        // Downloaded geojson, whole dataset.
        let counties = fs.readFileSync("../sourceData/us-county-boundaries.geojson", "utf8"); // lon,lat order!!!
        counties = JSON.parse(counties);
        counties = counties["features"];
        for (let i = 0; i < counties.length; i++) {
            let county = counties[i];
            for (let j = 0; j < ourCounties.length; j++) {
                let ourCounty = ourCounties[j];
                let ourState = ourStates[j];
                let ourCountyId = j;
                if (
                    (county.properties.namelsad == ourCounty || county.properties.name == ourCounty) &&
                    county.properties.stusab == ourState
                ) {
                    console.log("Found: " + county.properties.namelsad);
                    await this.readCensusCSV(ourCounty, ourState, j);
                    // Use the "turf" library to find which points are in a polygon that defines a county.
                    // http://turfjs.org/docs/#pointsWithinPolygon
                    let searchWithin = turf.polygon(county.geometry.coordinates);
                    let points = turf.points(pointList);
                    let ptsWithin = turf.pointsWithinPolygon(points, searchWithin);
                    // Loop through resulting points that are int the county and make a map of point to county ID.
                    for (let k = 0; k < ptsWithin.features.length; k++) {
                        let point = ptsWithin.features[k];
                        pointToCounty.set(
                            point.geometry.coordinates[0].toString() + "_" + point.geometry.coordinates[1].toString(),
                            ourCountyId
                        );
                    }
                    // Save off the polygon for any counties that have people in them.
                    if (ptsWithin.features.length > 0) {
                        let orig = county.geometry.coordinates[0];
                        orig = orig.map(a => [a[1], a[0]]); // Get back to lat, lon order.
                        this.relevantCountyPolygons.set(ourCountyId, orig);
                    }
                    console.log("Points inside county: " + ptsWithin.features.length);
                }
            }
        }
        // console.log(pointToCounty);
        return pointToCounty;
    }

    // Loads all includedCounties and their polygons and find the lat/lon bounds.
    // Saves it all out to a Map, key is countyIndex, value is bounding box. key -1 is union of all county bounds.
    async findCountyBounds() {
        let countyBounds = new Map();
        console.log("Loading county boundaries");
        let ourCounties = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[0]);
        let ourStates = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[1]);
        // County data from here: https://public.opendatasoft.com/explore/dataset/us-county-boundaries/export/?q=santa+clara
        // Downloaded geojson, whole dataset.
        let counties = fs.readFileSync("../sourceData/us-county-boundaries.geojson", "utf8"); // lon,lat order!!!
        counties = JSON.parse(counties);
        counties = counties["features"];
        for (let i = 0; i < counties.length; i++) {
            let county = counties[i];
            for (let j = 0; j < ourCounties.length; j++) {
                let ourCounty = ourCounties[j];
                let ourState = ourStates[j];
                let ourCountyId = j;
                if (
                    (county.properties.namelsad == ourCounty || county.properties.name == ourCounty) &&
                    county.properties.stusab == ourState
                ) {
                    console.log("Found: " + county.properties.namelsad);
                    let bbox = new misc.Box2();
                    let orig = county.geometry.coordinates[0];
                    for (let k = 0; k < orig.length; k++) {
                        let p = orig[k];
                        bbox.mergePoint([p[1], p[0]]); // Get back to lat, lon order.
                    }
                    countyBounds.set(ourCountyId, bbox);
                    console.log(bbox);
                }
            }
        }
        let totalBounds = new misc.Box2();
        for (let i = 0; i < countyBounds.size; i++) {
            totalBounds.union(countyBounds.get(i));
        }
        countyBounds.set(-1, totalBounds);
        return countyBounds;
    }

    // This takes a 2d array like: [[lat, lon, something, ...], [lat, lon, something, ...]]
    // It finds all county indexes and filters out anything that's not in one of our counties.
    // And outputs [[lat, lon, something, ..., countyIndex], [lat, lon, something, ..., countyIndex]]
    async tagListWithCountyIndexAndFilter(positionsJSON) {
        let result = [];
        // Make a lon/lat list of all the points
        let ll = []; // Just lon, lat - for point lists to find points in counties.
        for (let i = 0; i < positionsJSON.length; i++) {
            let posAndCount = positionsJSON[i];
            let lat = posAndCount[0];
            let lon = posAndCount[1];
            ll.push([lon, lat]); // lon, lat order!
        }

        // Set a county for each household (if there is one).
        let pointToCounty = await this.findCountiesForPointList(ll);
        for (let i = 0; i < positionsJSON.length; i++) {
            let posAndCount = positionsJSON[i];
            let placeLL = ll[i];
            let place = placeLL[0] + "_" + placeLL[1]; // lon, lat order!!!!
            if (pointToCounty.has(place)) {
                let orig = posAndCount.slice();
                orig.push(pointToCounty.get(place));
                result.push(orig);
            }
        }
        return result;
    }
}

module.exports = { CountyInfo };
