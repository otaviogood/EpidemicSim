<template>
    <div>
        <div style="font-size:32px; padding:12px; color: #ff8811;"><strong>YÆS:</strong> Yet Another Epidemic Simulator</div>
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
            <div style="width:365px;text-align:center;font-size:32px;">
                <span style="display:inline-block;">Person info</span>
                <label for="ticketNum">#</label>
                <input id="personIndex" type="number" value="0" style="width:80px;" @change="changePersonIndex" />
            </div>

            <div class="stats" style="font-size:17px">Location: {{ person.location }}</div>
            <div class="stats" style="font-size:17px">Health: {{ person.status }}</div>
            <div class="stats">Age (TODO): {{ person.age }}</div>
            <div class="stats">Id: {{ person.id }}</div>
            <div class="stats">asymptomatic overall? {{ person.asymptomaticOverall }}</div>
            <div class="stats">Symptom level: {{ person.symptoms }}</div>
        </span>
        <span class="card">
            <canvas
                style="display:block;background-color:#123456;"
                width="768px"
                height="768px"
                id="map-canvas"
                @click="clicked"
                @wheel="mouseWheel"
                @mousedown="handleMouseDown"
                @mousemove="handleMouseMove"
                @mouseup="handleMouseUp"
                @touchstart="handleTouchStart"
                @touchmove="handleTouchMove"
                @touchend="handleTouchEnd"
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
import { Spatial, Grid } from "./spatial";
import { Person, ActivityType } from "./person";
import { Sim, parseCSV } from "./sim";
import { log } from "util";
import { stat } from "fs";
import { runTests } from "./test_person";

let sim: Sim;
export default Vue.extend({
    data: function() {
        return {
            animId: -1,
            hoursElapsed: 0,
            currentlyInfected: 0,
            totalInfected: 0,
            milliseconds: 0,
            totalDead: 0,
            person: {
                age: -1,
                id: -1,
                location: "",
                status: "",
                asymptomaticOverall: false,
                symptoms: "",
            },
            mouse: {
                current: {
                    x: 0,
                    y: 0,
                },
                previous: {
                    x: 0,
                    y: 0,
                },
                down: false,
                mode: -1,
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
        runTests();
        sim = new Sim();
        await parseCSV(sim); // this await doesn't work. :/
        sim.paused = true;
    },
    methods: {
        updatePerson: function() {
            let self = this;
            let currentHour = sim.time_steps_since_start % 24;
            let p: Person = sim.pop.index(sim.selectedPersonIndex);
            self.person.id = p.id;
            self.person.asymptomaticOverall = !p.symptomaticOverall;
            // self.person.age = p.age;
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
            if (p.isShowingSymptoms) self.person.status += ", 🥵Symptoms";
            if (p.isRecovered) self.person.status = "🥳 Recovered!";
            if (p.dead) self.person.status = "☠️ DEAD";
            if (p.symptomsCurrent == 0) self.person.symptoms = "None";
            else if (p.symptomsCurrent == 1) self.person.symptoms = "Mild";
            else if (p.symptomsCurrent == 2) self.person.symptoms = "Severe";
            else if (p.symptomsCurrent == 3) self.person.symptoms = "Critical";
        },
        singleStepSim: function() {
            let self = this;
            let timer = performance.now();

            sim.run_simulation(1);
            self.hoursElapsed = sim.time_steps_since_start;
            self.currentlyInfected = sim.numActive;
            self.totalInfected = sim.totalInfected;
            self.totalDead = sim.totalDead;

            if (sim.time_steps_since_start > 0) {
                self.updatePerson();
            }

            let t2 = performance.now();
            self.milliseconds = t2 - timer;
            sim.draw();
        },
        tickAnim: function() {
            let self = this;
            if (sim && sim.numActive > 0 && !sim.paused) {
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
        changePersonIndex: function(e: any) {
            sim.selectedPersonIndex = e.target.valueAsNumber;
            this.updatePerson();
        },
        mouseWheel: function(event: any) {
            event.preventDefault();
            sim.changeZoom(Math.sign(event.deltaY));
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

        controllerDown: function(event: any, x: number, y: number) {
            this.mouse.down = true;
            this.mouse.current = {
                x: x,
                y: y,
            };
            // this.mouse.mode = -1;
            this.mouse.mode = 0;
            // If we're not actively dragging something, let people drag the phone screen.
            if (this.mouse.mode != -1) event.preventDefault();
        },
        controllerUp: function(event: any) {
            if (this.mouse.mode != -1) event.preventDefault();
            this.mouse.down = false;
        },
        controllerMove: function(event: any, x: number, y: number) {
            if (this.mouse.mode != -1) event.preventDefault();
            this.mouse.previous = this.mouse.current;
            this.mouse.current = {
                x: x,
                y: y,
            };
            if (this.mouse.down) {
                if (this.mouse.mode == 0) {
                    sim.translation(this.mouse.previous.x - this.mouse.current.x, this.mouse.previous.y - this.mouse.current.y);
                    // sim.centerx -= this.mouse.previous.x - this.mouse.current.x;
                    // sim.centery -= this.mouse.previous.y - this.mouse.current.y;
                    sim.draw();
                }
            }
        },

        handleMouseDown: function(event: any) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            this.controllerDown(
                event,
                ((event.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((event.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },
        handleMouseUp: function(event: any) {
            this.controllerUp(event);
        },
        handleMouseMove: function(event: any) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            this.controllerMove(
                event,
                ((event.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((event.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },

        handleTouchStart: function(event: any) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            let touch = event.changedTouches[0];
            this.controllerDown(
                event,
                ((touch.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((touch.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
        },
        handleTouchEnd: function(event: any) {
            this.controllerUp(event);
        },
        handleTouchMove: function(event: any) {
            let canvas = document.getElementById("map-canvas");
            if (!canvas) return;
            let [width, height] = [canvas.clientWidth, canvas.clientHeight];
            let rect = canvas.getBoundingClientRect();
            let touch = event.changedTouches[0];
            this.controllerMove(
                event,
                ((touch.clientX - rect.left) / (rect.right - rect.left)) * width,
                ((touch.clientY - rect.top) / (rect.bottom - rect.top)) * height
            );
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
