"use strict";
var assert = require("assert");
const fs = require("fs");

function loadJSONMap(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

function saveJSONMap(fname, mapA) {
    const localNodes = JSON.stringify(Object.fromEntries(mapA));
    fs.writeFileSync(fname, localNodes);
}

class Box2 {
    min = [Number.MAX_VALUE, Number.MAX_VALUE];
    max = [-Number.MAX_VALUE, -Number.MAX_VALUE];

    get Min() {
        return min;
    }
    set Min(value) {
        min = value;
    }

    get Max() {
        return max;
    }
    set Max(value) {
        max = value;
    }

    static newBox(min, max) {
        this.min[0] = Math.min(min[0], max[0]);
        this.min[1] = Math.min(min[1], max[1]);
        this.max[0] = Math.max(min[0], max[0]);
        this.max[1] = Math.max(min[1], max[1]);
    }

    clone() {
        let b = new Box2();
        b.min = [this.min[0], this.min[1]];
        b.max = [this.max[0], this.max[1]];
        return b;
    }

    // public bool IsDefined()
    // { return ((min.x <= max.x) && (min.y <= max.y)); }

    mergePoint(point1) {
        this.min[0] = Math.min(this.min[0], point1[0]);
        this.min[1] = Math.min(this.min[1], point1[1]);
        this.max[0] = Math.max(this.max[0], point1[0]);
        this.max[1] = Math.max(this.max[1], point1[1]);
    }

    // public bool Intersects(Box2 box)
    // {
    //     if (!IsDefined()) return false;
    //     if (!box.IsDefined()) return false;
    //     if (max.x < box.min.x) return false;
    //     if (min.x > box.max.x) return false;
    //     if (max.y < box.min.y) return false;
    //     if (min.y > box.max.y) return false;
    //     return true;
    // }

    // public bool Surrounds(Box2 box)
    // {
    //     if (!IsDefined()) return false;
    //     if (!box.IsDefined()) return false;
    //     if (min.x > box.min.x) return false;
    //     if (min.y > box.min.y) return false;
    //     if (max.x < box.max.x) return false;
    //     if (max.y < box.max.y) return false;
    //     return true;
    // }

    // public bool Contains(float2 point)
    // {
    //     if (!IsDefined()) return false;
    //     if (min.x > point.x) return false;
    //     if (min.y > point.y) return false;
    //     if (max.x < point.x) return false;
    //     if (max.y < point.y) return false;
    //     return true;
    // }

    union(box) {
        this.mergePoint(box.min);
        this.mergePoint(box.max);
    }

    // public void Intersection(Box2 box)
    // {
    //     if (!Intersects(box))
    //     {
    //         SetUndefined();
    //         return;
    //     }
    //     min = min.Max(box.min);
    //     max = max.Min(box.max);
    // }

    GetCentroid() {
        return [(this.min[0] + this.max[0]) * 0.5, (this.min[1] + this.max[1]) * 0.5];
    }

    // public float2 Size()
    // {
    //     return max - min;
    // }
}

module.exports = { loadJSONMap, saveJSONMap, Box2 };
