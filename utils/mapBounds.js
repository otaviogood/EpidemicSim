"use strict";

const defaultPlace = "santaCruz";

const info = {
    "sfCityLimits": {
        "mapImage": "sf_map_osm_hi.jpg",
        "lonMin": -122.526,
        "latMin": 37.708,
        "lonMax": -122.354,
        "latMax": 37.815,
    },
    "santaCruz": {
        "mapImage": "sc_map_osm_hi.jpg",
        "lonMin": -122.2119,
        "latMin": 36.9345,
        "lonMax": -121.8226,
        "latMax": 37.1483,
    },
    "sfBayArea": {
        "mapImage": "ba_map_osm_hi.jpg",
        "lonMin": -122.6651,
        "latMin": 37.0771,
        "lonMax": -121.5747,
        "latMax": 38.2037,
    },
};

module.exports = { info, defaultPlace };
