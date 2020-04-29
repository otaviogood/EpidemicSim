<template>
    <div>
        <h1>
            {{ name }}
        </h1>
        <canvas
            style="float:right;display:block;background-color:#123456"
            width="256px"
            height="512px"
            id="graph-canvas"
        ></canvas>
        <canvas
            style="display:block;background-color:#123456"
            width="768px"
            height="768px"
            id="map-canvas"
            @click="clicked"
        ></canvas>
        <p>
            <button
                type="button"
                class=""
                style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;"
                @click="playPause"
            >
                ⏯️
            </button>
            <button
                type="button"
                class=""
                style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;"
                @click="restart"
            >
                🔁
            </button>
            <strong>Currently Infected: {{ currentlyInfected }}</strong
            ><br />
            <strong>Total Infected: {{ totalInfected }}</strong
            ><br />
            Hours: {{ hoursElapsed }}<br />
            Days: {{ Math.floor(hoursElapsed / 24) }}
        </p>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { Person, Spatial, Grid } from "./spatial";
import { Sim, parseCSV } from "./sim";

let sim: Sim;
export default Vue.extend({
    data: function() {
        return {
            animId: -1,
            name: "Epidemic Sim",
            hoursElapsed: 0,
            currentlyInfected: 0,
            totalInfected: 0,
        };
    },
    created: function() {
        let self = this;
        self.animId = window.requestAnimationFrame(self.tickAnim);
    },
    destroyed() {
        window.cancelAnimationFrame(this.animId);
        this.animId = -1;
    },
    mounted: async function() {
        let self = this;
        sim = new Sim();
        await parseCSV(sim); // this await doesn't work. :/
        // await sim.setup();
    },
    methods: {
        tickAnim: function() {
            let self = this;
            if (sim.numActive > 0 && !sim.paused) {
                sim.run_simulation(1);
                self.hoursElapsed = sim.time_steps_since_start;
                self.currentlyInfected = sim.numActive;
                self.totalInfected = sim.totalInfected;
                sim.draw();
            }

            this.animId = window.requestAnimationFrame(() => self.tickAnim());
        },
        // x, y will be [0..1] range from upper left to lower right.
        controllerClick: function(event: any, x: number, y: number) {
            // If we're not actively dragging something, let people drag the phone screen.
            // if (this.mouse.mode != -1) event.preventDefault();
            // console.log(x.toString() + "   " + y.toString());
            sim.controllerClick(x, y);
        },

        clicked: function(event: any) {
            var rect = document.getElementById("map-canvas")!.getBoundingClientRect();
            this.controllerClick(
                event,
                (event.clientX - rect.left) / (rect.right - rect.left),
                (event.clientY - rect.top) / (rect.bottom - rect.top)
            );
        },
        playPause: function(event: any) {
            sim.playPause();
        },
        restart: function(event: any) {
            sim = new Sim();
            parseCSV(sim); // this await doesn't work. :/
        },
    },
});
</script>

<style>
h1 {
    font-family: sans-serif, Arial;
    color: #ff8811;
}
body {
    font-family: sans-serif, Arial;
    font-size: 16px;
}
</style>
