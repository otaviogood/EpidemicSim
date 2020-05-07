<template>
    <div>
        <h2>
            {{ name }}
        </h2>
        <span class="card" style="float:right;">
            <canvas
                style="display:block;background-color:#123456;margin-bottom:4px"
                width="365px"
                height="256px"
                id="graph-canvas"
            ></canvas>
            <span style="background-color:#ffcf5f;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Total Infected: {{ totalInfected }}</strong
            ><br />
            <span style="background-color:#ffffff;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Currently Infected: {{ currentlyInfected }}</strong
            ><br />
            <span style="background-color:#ff3711;display:inline-block;width:14px;height:14px;margin-right:4px"></span
            ><strong>Total dead: {{ totalDead }}</strong
            ><br />
            <hr />
            <span style="width:180px;display:inline-block">Hours: {{ hoursElapsed }}</span>
            Days: {{ Math.floor(hoursElapsed / 24) }}<br />
        </span>
        <span class="card clearfix" style="float:right;margin-top:16px">
            <div style="width:365px;text-align: center"><h3 style="display:inline-block;">Person info</h3></div>

            <div class="stats" style="font-size:17px">Location: {{ person.location }}</div>
            <div class="stats" style="font-size:17px">Health: {{ person.status }}</div>
            <div class="stats">Age: {{ person.age }}</div>
            <div class="stats">Id: {{ person.id }}</div>
            <div class="stats"></div>
        </span>
        <span class="card">
            <canvas
                style="display:block;background-color:#123456;"
                width="768px"
                height="768px"
                id="map-canvas"
                @click="clicked"
            ></canvas>
            <p style="margin:8px;">
                <button
                    type="button"
                    class=""
                    style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                    @click="playPause"
                >
                    ⏯️
                </button>
                <button
                    type="button"
                    class=""
                    style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                    @click="stepForward"
                >
                    ⤵️
                </button>
                <button
                    type="button"
                    class=""
                    style="font-size:48px;float:left;margin-right:16px;padding:0px;border:0px;background-color:#00000000;"
                    @click="restart"
                >
                    🔁
                </button>
                Sim Time (Milliseconds): {{ Math.round(milliseconds) }}<br />
            </p>
        </span>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { Person, Spatial, Grid } from "./spatial";
import { Sim, parseCSV } from "./sim";
import { log } from "util";
import { stat } from "fs";

let sim: Sim;
export default Vue.extend({
    data: function() {
        return {
            animId: -1,
            name: "Epidemic Sim",
            hoursElapsed: 0,
            currentlyInfected: 0,
            totalInfected: 0,
            milliseconds: 0,
            totalDead: 0,
            person: {
                age: null,
                id: null,
                location: "",
                status: "",
            },
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
        sim.paused = true;
    },
    methods: {
        singleStepSim: function() {
            let self = this;
            let timer = performance.now();

            sim.run_simulation(1);
            self.hoursElapsed = sim.time_steps_since_start;
            self.currentlyInfected = sim.numActive;
            self.totalInfected = sim.totalInfected;
            self.totalDead = sim.totalDead;

            if (sim.time_steps_since_start > 0) {
                let currentHour = sim.time_steps_since_start % 24;
                let p: Person = sim.pop.index(sim.selectedPersonIndex);
                self.person.id = p.id;
                self.person.age = p.age;
                const icons = new Map([
                    ["h", "🏡 Home"],
                    ["w", "🏢 Office"],
                    ["s", "🏪 Supermarket"],
                    ["o", "🏥 Hospital"],
                    ["c", "🚗 Car"],
                    ["t", "🚂 Train"],
                ]);
                let act = p.getCurrentActivity(currentHour);
                self.person.location = icons.get(act)!.toString();
                self.person.status = "🙂 Happily not sick";
                if (p.isSick) self.person.status = "🦠Sick";
                if (p.isContagious) self.person.status += ", ❗Contagious";
                if (p.isSymptomatic) self.person.status += ", 🥵Symptoms";
                if (p.isRecovered) self.person.status = "🥳 Recovered!"
                if (p.dead) self.person.status = "☠️ DEAD"
            }

            let t2 = performance.now();
            self.milliseconds = t2 - timer;
            sim.draw();
        },
        tickAnim: function() {
            let self = this;
            if (sim.numActive > 0 && !sim.paused) {
                self.singleStepSim();
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
        stepForward: function(event: any) {
            this.singleStepSim();
        },
        restart: function(event: any) {
            sim = new Sim();
            parseCSV(sim); // this await doesn't work. :/
        },
    },
});
</script>

<style>
h2 {
    font-family: sans-serif, Arial;
    color: #ff8811;
}
body {
    font-family: sans-serif, Arial;
    font-size: 16px;
}
.card {
    display: inline-block;
    border: 1px solid #aaaaaa;
    padding: 8px;
    background-color: #cceeff;
    border-radius: 8px;
}
.clearfix {
    content: "";
    clear: both;
    display: table;
}
.stats {
    border-top: 1px solid #cccccc;
    padding: 2px;
}
</style>
