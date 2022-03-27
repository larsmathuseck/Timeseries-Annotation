import { createStore } from 'vuex';
import { parse } from "@vanillaes/csv";
import { db } from "/db";
import { breakDownToSamplingrate } from '../util/model/ModelInstances';

export default createStore({
    state: {
        data: {},
        downSamplingData: [],
        selectedData: null,
        activeLabel: null,
        areasVisible: false,
        colors: ["red", "orange", "olive", "green", "teal", "blue", "violet", "purple", "pink", "brown", "grey"],
    },
    mutations: {
        addData: (state, payload) => {
            let data = parse(payload.result);
            let legende = data.shift();
            let timestamps = [];
            let axes = [];

            // Get Timestamps
            let timestampLocation = -1;
            for(let i = 0; i < legende.length; i++){
                if(legende[i].toLowerCase() == "timestamp"){
                    timestampLocation = i;
                }
                else {
                    axes.push({
                        id: i,
                        name: legende[i],
                        dataPoints: [],
                        color: state.colors[i % state.colors.length],
                    });
                }
            }
            if(timestampLocation >= 0){
                data.forEach(row => {
                    timestamps.push(new Date(row[timestampLocation]).getTime());
                    row.splice(timestampLocation, 1);
                });
                
                // Delete last not full second
                const lastTimestamp = (timestamps[timestamps.length-1] - (timestamps[timestamps.length-1] - timestamps[0])%1000);
                let time = timestamps[timestamps.length-1];
                while(time > lastTimestamp){
                    if(timestamps[timestamps.length-2] <= lastTimestamp){
                        break;
                    }
                    time = timestamps.pop();
                }
                
                // Get dimensions in own arrays
                for(let row = 0; row < timestamps.length; row++){
                    for(let column = 0; column < data[row].length; column++){
                        axes[column].dataPoints.push([new Date(timestamps[row]).getTime(), data[row][column]]);   
                    }
                }
                let id = 0;
                if(Object.keys(state.data).length > 0){
                    const keys = Object.keys(state.data);
                    id = parseInt(keys[keys.length-1]) + 1;
                }
                Object.assign(state.data, {[id]: {
                    id: id,
                    name: payload.name,
                    axes: axes,
                    timestamps: timestamps,
                    selectedAxes: [axes[0].id],
                }});
                state.selectedData = id;
            }
        },
        deleteData: (state) => {
            delete state.data[state.selectedData];
            if (Object.keys(state.data).length > 0) {
                state.selectedData = parseInt(Object.keys(state.data)[0]);
            }
            else {
                state.selectedData = null;
            }
        },
        addAxis: (state, payload) => {
            const axes = state.data[state.selectedData].axes;
            const axisData = axes[payload.axis.id-1].dataPoints;
            let data = breakDownToSamplingrate([axisData], state.data[state.currentSelectedDataIndex].timestamps, payload.samplingRate, payload.feature.id);
            data = data[1].map((x) => { return [data[0][data[1].indexOf(x)], x[0]]; });
            const axis = {
                id: axisData[axisData.length-1] +1,
                name: payload.name,
                dataPoints: data,
                color: payload.color,
                samplingRate: payload.samplingRate,
                feature: payload.feature, 
            };
            state.data[state.selectedData].axes.push(axis);
            state.data[state.selectedData].selectedAxes.push(axis.id);
        },
        updateAxis: (state, payload) => {
            let axes = state.data[state.selectedData].axes;
            axes.forEach(axis => {
                if(axis.id == payload.id){
                    axis.name = payload.name;
                    axis.color = payload.color;
                }
            });
        },
        deleteAxis: (state, payload) => {
            let axes = state.data[state.selectedData].axes;
            if(axes.length > 1){
                const index = axes.indexOf(payload);
                axes.splice(index, 1);
            }
        },
        addAnnotationData: async (state, payload) => {
            let data = parse(payload.result);
            let legende = data.shift();
            let lastAnn = {};

            let anno = await db.annotations.add({
                name: payload.name,
                lastAdded: lastAnn,
            });

            // Get Timestamp and Label location
            let timestampLocation = -1;
            let labelLocation = -1;
            for(let i = 0; i < legende.length; i++){
                if(legende[i].toLowerCase() == "timestamp"){
                    timestampLocation = i;
                }
                else if(legende[i].toLowerCase() == "label"){
                    labelLocation = i;
                }
            }

            for(let i = 0; i < data.length; i++){
                let label = await db.labels.where('[annoId+name]').equals([anno, data[i][labelLocation]]).toArray();
                if(label.length === 0){
                    label = await db.labels.add({
                        name: data[i][labelLocation],
                        color: state.colors[i % state.colors.length],
                        annoId: anno,
                    });
                }
                else{
                    label = label[0].id;
                }
                const newAnn = await db.annoData.add({
                    labelId: label,
                    annoId: anno,
                    timestamp: new Date(data[i][timestampLocation]).getTime(),
                });
                lastAnn = newAnn;
            }
            await db.lastSelected.put({id: 1, annoId: anno});
            anno = await db.annotations.update(anno, {lastAdded: lastAnn});
        },
        addSelectedAxes: (state, axis) => {
            state.data[state.selectedData].selectedAxes.push(axis.id);
        },
        deleteSelectedAxis: (state, axis) => {
            let selectedAxes = state.data[state.selectedData].selectedAxes;
            const index = selectedAxes.indexOf(axis.id);
            if (index > -1) {
                selectedAxes.splice(index, 1);
            }
        },
        changeAxisColor: (state, changedAxis) => {
            let axes = state.data[state.selectedData].dataPoints;
            for (let i in axes) {
                if (axes[i].id === changedAxis.id) {
                    axes[i].color = changedAxis.color;
                    break;
                }
            }
        },
        toggleActiveLabel: (state, label) => {
            state.activeLabel = label;
        },
        selectDataFile: (state, dataFileId) => {
            state.selectedData = dataFileId;
        },
        toggleAreasVisibility: (state) => {
            state.areasVisible = !state.areasVisible;
        },
        setDownsamplingData: (state, data) => {
            state.downSamplingData = data;
        },
    },
    getters: {
        getData: state => {
            if(Object.keys(state.data).length > 0){
                return state.data[state.selectedData].axes.filter(key => state.data[state.selectedData].selectedAxes.includes(key.id));
            }
            return [];
        },
        getDownsamplingData: state => {
            return state.downSamplingData;
        },
        getAxes: state => {
            if(Object.keys(state.data).length > 0){
                return state.data[state.selectedData].axes;
            }
            return [];
        },
        timestamps: state => {
            if(Object.keys(state.data).length > 0){
                return state.data[state.selectedData].timestamps;
            }
            return [];
        },
        selectedAxes: state => {
            if(Object.keys(state.data).length > 0){
                return state.data[state.selectedData].selectedAxes;
            }
            return [];
        },
        showGraph: state => {
            if(Object.keys(state.data).length > 0){
                return true;
            }
            else {
                return false;
            }
        }
    },
});
