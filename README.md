# YÆS: Yet Another Epidemic Simulator

## Building and running on localhost

First install dependencies:

```sh
npm install
```

To run in hot module reloading mode (disabled HMR):

```sh
npm start
```

To create a production build:

```sh
npm run build-prod
```

## Utils and data processing pipeline
Put all these big downloaded files in the sourceData folder. TODO: automate the downloading with a script???

Get northern california OpenStreetMaps data (norcal-latest.osm.pbf) here: http://download.geofabrik.de/north-america/us/california/norcal.html  
Use openstreetmapFilter.js to filter out the relevant region (lat/lon bounds set in code) and find buildings of interest, like businesses, hospitals, supermarkets.  

Got Facebook population density maps here: https://data.humdata.org/dataset/united-states-high-resolution-population-density-maps-demographic-estimates  
Use QGIS software to export a layer inside of the lat/lon bounds.  
Use geotiff.js to export a people positions file from the population density data.  

County data from here: https://public.opendatasoft.com/explore/dataset/us-county-boundaries/export/?q=santa+clara
Downloaded geojson, whole dataset.
It will be used by processBuildings.js to put each house in a county.

Define map boundaries in utils/mapBounds.js

inside utils, run:
```sh
node openstreetmapFilter.js
node geotiff.js
node processBuildings.js
```

-----------------------

For large map areas, like major metro areas, you might run out of memory. In openstreetmapFilter.js, turn on noCacheHack. Then use this cmd-line for extra memory.

```sh
node --max-old-space-size=16384 openstreetmapFilter.js
```

## Credits

Made with [createapp.dev](https://createapp.dev/)

