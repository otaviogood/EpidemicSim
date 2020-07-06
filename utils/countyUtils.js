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

// https://www.census.gov/library/reference/code-lists/ansi/ansi-codes-for-states.html
// STATE, STUSAB, STATE_NAME, STATENS
let stateNumbers = [
    ["01", "AL", "Alabama", "01779775"],
    ["02", "AK", "Alaska", "01785533"],
    ["04", "AZ", "Arizona", "01779777"],
    ["05", "AR", "Arkansas", "00068085"],
    ["06", "CA", "California", "01779778"],
    ["08", "CO", "Colorado", "01779779"],
    ["09", "CT", "Connecticut", "01779780"],
    ["10", "DE", "Delaware", "01779781"],
    ["11", "DC", "District of Columbia", "01702382"],
    ["12", "FL", "Florida", "00294478"],
    ["13", "GA", "Georgia", "01705317"],
    ["15", "HI", "Hawaii", "01779782"],
    ["16", "ID", "Idaho", "01779783"],
    ["17", "IL", "Illinois", "01779784"],
    ["18", "IN", "Indiana", "00448508"],
    ["19", "IA", "Iowa", "01779785"],
    ["20", "KS", "Kansas", "00481813"],
    ["21", "KY", "Kentucky", "01779786"],
    ["22", "LA", "Louisiana", "01629543"],
    ["23", "ME", "Maine", "01779787"],
    ["24", "MD", "Maryland", "01714934"],
    ["25", "MA", "Massachusetts", "00606926"],
    ["26", "MI", "Michigan", "01779789"],
    ["27", "MN", "Minnesota", "00662849"],
    ["28", "MS", "Mississippi", "01779790"],
    ["29", "MO", "Missouri", "01779791"],
    ["30", "MT", "Montana", "00767982"],
    ["31", "NE", "Nebraska", "01779792"],
    ["32", "NV", "Nevada", "01779793"],
    ["33", "NH", "New Hampshire", "01779794"],
    ["34", "NJ", "New Jersey", "01779795"],
    ["35", "NM", "New Mexico", "00897535"],
    ["36", "NY", "New York", "01779796"],
    ["37", "NC", "North Carolina", "01027616"],
    ["38", "ND", "North Dakota", "01779797"],
    ["39", "OH", "Ohio", "01085497"],
    ["40", "OK", "Oklahoma", "01102857"],
    ["41", "OR", "Oregon", "01155107"],
    ["42", "PA", "Pennsylvania", "01779798"],
    ["44", "RI", "Rhode Island", "01219835"],
    ["45", "SC", "South Carolina", "01779799"],
    ["46", "SD", "South Dakota", "01785534"],
    ["47", "TN", "Tennessee", "01325873"],
    ["48", "TX", "Texas", "01779801"],
    ["49", "UT", "Utah", "01455989"],
    ["50", "VT", "Vermont", "01779802"],
    ["51", "VA", "Virginia", "01779803"],
    ["53", "WA", "Washington", "01779804"],
    ["54", "WV", "West Virginia", "01779805"],
    ["55", "WI", "Wisconsin", "01779806"],
    ["56", "WY", "Wyoming", "01779807"],
    ["60", "AS", "American Samoa", "01802701"],
    ["66", "GU", "Guam", "01802705"],
    ["69", "MP", "Northern Mariana Islands", "01779809"],
    ["72", "PR", "Puerto Rico", "01779808"],
    ["74", "UM", "U.S. Minor Outlying Islands", "01878752"],
    ["78", "VI", "U.S. Virgin Islands", "01802710"],
];
function getStateNumber(abbr) {
    let index = stateNumbers.findIndex(x => x[1] === abbr);
    return stateNumbers[index][0];
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
    acsInfo = new Map(); // American community survey

    // American community survey data
    acsPopulation = 0;
    fractionMale = 0.5;
    fractionAge0_4 = 0.05;
    fractionAge5_9 = 0.05;
    fractionAge10_14 = 0.05;
    fractionAge15_19 = 0.05;
    fractionAge20_24 = 0.05;
    fractionAge25_34 = 0.1;
    fractionAge35_44 = 0.1;
    fractionAge45_54 = 0.1;
    fractionAge55_59 = 0.05;
    fractionAge60_64 = 0.05;
    fractionAge65_74 = 0.1;
    fractionAge75_84 = 0.1;
    fractionAge85_up = 0.1;
    // Race TODO: What data is there on race and covid, so what race categories should there be?

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
        // let url = "https://www.census.gov/quickfacts/fact/csv/" + mashedName + "/HCN010212";
        // console.log(url);
        // if (!fs.existsSync(censusFileName)) {
        //     try {
        //         var content = downloadFileSync(url);
        //         console.log(content);
        //         // // Do some wacky stuff from here: https://github.com/JCMais/node-libcurl/blob/HEAD/COMMON_ISSUES.md
        //         // const certFilePath = path.join(__dirname, "cert.pem");
        //         // const tlsData = tls.rootCertificates.join("\n");
        //         // fs.writeFileSync(certFilePath, tlsData);

        //         // const { statusCode, data, headers } = await curly.get(url, {
        //         //     caInfo: certFilePath,
        //         //     // verbose: true,
        //         //     httpHeader: ['Content-type: text/csv; charset=utf-8'],
        //         //     acceptEncoding: 'gzip, deflate, br',
        //         // });
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

    // American community survey is older than the standard census data, but has some extra info.
    async readAmericanCommunitySurveyCSV(countyName, stateAbbr, countyIndex) {
        if (!this.acsInfo.has(countyIndex)) this.acsInfo.set(countyIndex, new Map());
        let countyStateNumber = getStateNumber(stateAbbr);
        console.log("-------- Loading American Community Survey data for " + countyName + ", county state number " + countyStateNumber + ", " + stateAbbr + " --------");
        const csvString = fs.readFileSync("../sourceData/Profiles0502004.csv", "utf8");
        let csvResult = await papa.parsePromise(csvString);
        csvResult = csvResult.data;
        // console.log(csvResult);
        assert(csvResult[0].length == 8); // Make sure this file has the right number of columns
        let csvGeoidIndex = 0;
        let csvCountyIndex = 1;
        let csvTableNumber = 2;
        let csvTableOrder = 3;
        let csvDescription = 4;
        let csvValue = 5;
        assert(csvResult[0][csvGeoidIndex] == "Geographic ID Code"); // Check that file format is right
        assert(csvResult[0][csvCountyIndex] == "Geographic Name"); // Check that file format is right
        assert(csvResult[0][csvTableNumber] == "Table Number"); // Check that file format is right
        assert(csvResult[0][csvTableOrder] == "Table Order"); // Check that file format is right
        assert(csvResult[0][csvDescription] == "Stub"); // Check that file format is right
        assert(csvResult[0][csvValue] == "Estimate"); // Check that file format is right

        for (let i = 1; i < csvResult.length; i++) {
            let stateNumber = csvResult[i][csvGeoidIndex].slice(7, 9);
            if (stateNumber == countyStateNumber) {
                if (csvResult[i][csvCountyIndex] == countyName) {
                    let uniqueDescription = csvResult[i][csvTableOrder] + "_" + csvResult[i][csvDescription];
                    if (csvResult[i][csvTableNumber] == "DP001") {
                        let fraction = (parseInt(csvResult[i][csvValue]) * 1.0) / this.acsPopulation;
                        if (uniqueDescription == "1_Total population") {
                            this.acsPopulation = parseInt(csvResult[i][csvValue]);
                            console.log("Population of " + countyName + ": " + this.acsPopulation);
                        } else if (uniqueDescription == "3_Male") this.fractionMale = fraction;
                        else if (uniqueDescription == "5_Under 5 years") this.fractionAge0_4 = fraction;
                        else if (uniqueDescription == "6_5 to 9 years") this.fractionAge5_9 = fraction;
                        else if (uniqueDescription == "7_10 to 14 years") this.fractionAge10_14 = fraction;
                        else if (uniqueDescription == "8_15 to 19 years") this.fractionAge15_19 = fraction;
                        else if (uniqueDescription == "9_20 to 24 years") this.fractionAge20_24 = fraction;
                        else if (uniqueDescription == "10_25 to 34 years") this.fractionAge25_34 = fraction;
                        else if (uniqueDescription == "11_35 to 44 years") this.fractionAge35_44 = fraction;
                        else if (uniqueDescription == "12_45 to 54 years") this.fractionAge45_54 = fraction;
                        else if (uniqueDescription == "13_55 to 59 years") this.fractionAge55_59 = fraction;
                        else if (uniqueDescription == "14_60 to 64 years") this.fractionAge60_64 = fraction;
                        else if (uniqueDescription == "15_65 to 74 years") this.fractionAge65_74 = fraction;
                        else if (uniqueDescription == "16_75 to 84 years") this.fractionAge75_84 = fraction;
                        else if (uniqueDescription == "17_85 years and over") this.fractionAge85_up = fraction;
                    }
                    // Make a key/value dictionary of all the values just in case it's useful.
                    if (!isNaN(parseFloat(csvResult[i][csvValue]))) {
                        if (this.acsInfo.get(countyIndex).get(uniqueDescription)) console.log(this.acsInfo.get(countyIndex));
                        this.acsInfo.get(countyIndex).set(uniqueDescription, csvResult[i][csvValue]);
                    }
                }
            }
        }
        if (this.acsPopulation < 1) console.log("**** WARNING: " + countyName + " not found in ACS Data. ****");
        assert(this.acsPopulation > 0);
        // console.log(this.acsInfo);
    }

    async readAllCountiesCensus() {
        let ourCounties = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[0]);
        let ourStates = mapBounds.info[mapBounds.defaultPlace].includedCounties.map(x => x[1]);
        for (let j = 0; j < ourCounties.length; j++) {
            let ourCounty = ourCounties[j];
            let ourState = ourStates[j];
            let ourCountyId = j;
            await this.readCensusCSV(ourCounty, ourState, ourCountyId);
            await this.readAmericanCommunitySurveyCSV(ourCounty, ourState, ourCountyId);
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
                    // Use the "turf" library to find which points are in a polygon that defines a county.
                    // http://turfjs.org/docs/#pointsWithinPolygon
                    let coords = county.geometry.coordinates;
                    // This is weird. Most counties have a single polygon as their boundaries. But San francisco has 2 because the Farallon Islands belong to SF.
                    // So for SF, the array dimension is 1 bigger! - [2, 1, 425, 2] which represents [islands, ?, vertices, lat + lon]
                    // For most counties, the array dimension in 3 - [1, 2332, 2] which represents [?, vertices, lat + lon]
                    // This code unifies them to both be 4d, like San Francisco, and it loops through the islands dimension.
                    let dims = misc.getDim(coords);
                    if (dims.length == 3) coords = [coords];
                    dims = misc.getDim(coords);
                    console.log(misc.getDim(coords));
                    for (let poly = 0; poly < dims[0]; poly++) {
                        let searchWithin = turf.polygon(coords[poly]);
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
                            let orig = coords[poly][0];
                            orig = orig.map(a => [a[1], a[0]]); // Get back to lat, lon order.
                            // This is not perfect... append polygon array if it already exists.
                            // TODO: Does this append actually work for San Francisco???
                            if (this.relevantCountyPolygons.has(ourCountyId))
                                this.relevantCountyPolygons.set(
                                    ourCountyId,
                                    this.relevantCountyPolygons.get(ourCountyId).concat(orig)
                                );
                            else this.relevantCountyPolygons.set(ourCountyId, orig);
                        }
                        console.log("Points inside county: " + ptsWithin.features.length);
                    }
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
        assert(counties);
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
                    let coords = county.geometry.coordinates;
                    // This is weird. Most counties have a single polygon as their boundaries. But San francisco has 2 because the Farallon Islands belong to SF.
                    // So for SF, the array dimension is 1 bigger! - [2, 1, 425, 2] which represents [islands, ?, vertices, lat + lon]
                    // For most counties, the array dimension in 3 - [1, 2332, 2] which represents [?, vertices, lat + lon]
                    // This code unifies them to both be 4d, like San Francisco, and it loops through the islands dimension.
                    let dims = misc.getDim(coords);
                    if (dims.length == 3) coords = [coords];
                    dims = misc.getDim(coords);
                    console.log(misc.getDim(coords));
                    for (let poly = 0; poly < dims[0]; poly++) {
                        for (let k = 0; k < coords[poly][0].length; k++) {
                            let p = coords[poly][0][k];
                            bbox.mergePoint([p[1], p[0]]); // Get back to lat, lon order.
                        }
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
