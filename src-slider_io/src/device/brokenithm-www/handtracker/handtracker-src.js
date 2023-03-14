const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
const circle = document.getElementById("circle");
const circle2 = document.getElementById("circle2");
const zone = document.getElementById("zone");
const height = document.getElementById("zoneValue");
const customHeight = document.getElementById("customHeight");
let canvasOffset = null;

const detectionsPerSeconds = document.getElementById("detectionsPerSeconds");
const pauseButton = document.getElementById("pauseButton");
const hFlip = document.getElementById("hFlip");
const scoreThreshold = document.getElementById("scoreThreshold");
const iouThreshold = document.getElementById("iouThreshold");
const modelType = document.getElementById("modelType");
const modelSize = document.getElementById("modelSize");

// Handtrack.js https://victordibia.com/handtrack.js/#/docs
const modelParams = {
  flipHorizontal: true,
  outputStride: 16,
  imageScaleFactor: 1,
  maxNumBoxes: 3, // Head is the 3rd bbox.
  iouThreshold: 0.2,
  scoreThreshold: 0.35,
  modelType: "ssd320fpnlite",
  modelSize: "large",
};

let paused = false;
let cameraRenderer = true;
let horizontalFlip = true;
let hand0 = {};
let hand1 = {};
let lastHandValue0 = -1;
let lastHandValue1 = -1;
let zoneHeight = 250;
let zoneLevels = zoneHeight / 6;

// Initially taken from https://github.com/victordibia/handtrack.js/tree/master/demo
handTrack.load(modelParams).then((m) => {
  console.info("Model loaded.");
  initializeListeners();
  model = m;
  message = document.getElementById("message");
  message.style.display = "none";
  startVideo();
  wsConnect();
  setInterval(wsWatch, 1000);
});

function updateModel(params) {
  model.setModelParameters(params);
}

function initializeListeners() {
  // Disposing the model instance from GPU memory. With Tensorflow.js this does not happen automatically.
  window.addEventListener("beforeunload", () => {
    if (model != null) {
      console.info("Disposing the model instance.");
      model.dispose();
    }
  });
  // Pause sending input to slidershim
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Paused" : "Running";
  });
  // Disable rendering the camera renderer, saves some CPU probably.
  cameraButton.addEventListener("click", () => {
    cameraRenderer = !cameraRenderer;
    cameraButton.textContent = cameraRenderer
      ? "Disable Camera Renderer"
      : "Enable Camera Renderer";
  });
  // Update horizontal flip.
  hFlip.addEventListener("click", () => {
    horizontalFlip = !horizontalFlip;
    hFlip.textContent = horizontalFlip
      ? "Camera Flipped Horizontally"
      : "Camera Not Flipped Horizontally";
    updateModel({ flipHorizontal: horizontalFlip });
  });
  // Update score threshold.
  scoreThreshold.addEventListener("change", () => {
    updateModel({ scoreThreshold: scoreThreshold.value });
  });
  // Update iou threshold.
  iouThreshold.addEventListener("change", () => {
    updateModel({ iouThreshold: iouThreshold.value });
  });
  // Update model type.
  modelType.addEventListener("change", () => {
    updateModel({ modelType: modelType.value });
  });
  // Update model size.
  modelSize.addEventListener("change", () => {
    updateModel({ modelSize: modelSize.value });
  });
}

function startVideo() {
  handTrack.startVideo(video).then((status) => {
    console.info("Video started", status.msg);
    if (status) {
      console.info("Tracking...");
      zone.style.height = zoneHeight + "px";
      customHeight.addEventListener("change", () => {
        zoneHeight = customHeight.value;
        zoneLevels = zoneHeight / 6;
        zone.style.height = zoneHeight + "px";
      });
      runDetection();
    } else {
      console.error("Please enable video.");
    }
  });
}

function runDetection() {
  model.detect(video).then((predictions) => {
    for (var i = 0; i < predictions.length; i++) {
      if (!predictions[i]?.bbox || predictions[i]?.label === "face") {
        continue;
      }
      detection = getHandCenter(i, predictions[i].bbox);
      if (detection.id !== -1) {
        if (i === 0) {
          hand0 = detection;
        } else {
          hand1 = detection;
        }
      }
    }
    if (cameraRenderer) {
      model.renderPredictions(predictions, canvas, context, video);
    }
    const handValue0 = getAirZoneValue0();
    const handValue1 = getAirZoneValue1();
    if (handValue0 != lastHandValue0 || handValue1 != lastHandValue1) {
      updateTouches();
    }
    showResults(handValue0, handValue1);
    lastHandValue0 = handValue0;
    lastHandValue1 = handValue1;
    requestAnimationFrame(runDetection);
  });
}

function showResults(handValue0, handValue1) {
  canvasOffset = canvas.getBoundingClientRect();
  zone.style.left = canvasOffset.left + "px";
  zone.style.width = canvasOffset.width + "px";
  const contentMarginTopOffset = 15;
  if (hand0?.id != null) {
    circle.style.transform =
      "translate3d(" +
      (canvasOffset.left + hand0.x) +
      "px," +
      (canvasOffset.top + hand0.y - contentMarginTopOffset) +
      "px,0)";
  }
  if (hand1?.id != null) {
    circle2.style.transform =
      "translate3d(" +
      (canvasOffset.left + hand1.x) +
      "px," +
      (canvasOffset.top + hand1.y - contentMarginTopOffset) +
      "px,0)";
  }
  height.textContent = handValue0 + ", " + handValue1;
  detectionsPerSeconds.textContent = model.getFPS();
}

function getHandCenter(index, bbox) {
  if (Array.isArray(bbox) && bbox.length === 4) {
    let xCenter = bbox[0] + bbox[2] / 2;
    let yCenter = bbox[1] + bbox[3] / 2;
    return { id: index, x: xCenter, y: yCenter };
  }
  return { id: -1, x: 0, y: 0 };
}

// unused
function isAnyInAirZone() {
  const lowestY = hand0.y > hand1.y ? hand1.y : hand0.y;
  return lowestY <= zoneHeight;
}

function getAirZoneValue0() {
  if (hand0.y > zoneHeight) {
    return -1;
  }
  // kflag is 0-5
  return 5 - Math.floor(hand0.y / zoneLevels);
}

function getAirZoneValue1() {
  if (hand1.y > zoneHeight) {
    return -1;
  }
  // kflag is 0-5
  return 5 - Math.floor(hand1.y / zoneLevels);
}

// Initially taken from brokenithm src.js

// Button State
// prettier-ignore
var lastState = [0, 0, 0, 0, 0, 0];

function updateTouches() {
  if (paused) {
    return;
  }
  try {
    // prettier-ignore
    let keyFlags = [0, 0, 0, 0, 0, 0];

    const h0 = getAirZoneValue0();
    const h1 = getAirZoneValue1();
    if (h0 > -1) {
      keyFlags[h0] = 1;
    }
    if (h1 > -1) {
      keyFlags[h1] = 1;
    }

    if (keyFlags !== lastState) {
      throttledSendKeys(keyFlags);
    }
    lastState = keyFlags;
  } catch (err) {
    alert(err);
  }
}

const throttle = (func, wait) => {
  var ready = true;
  var args = null;
  return function throttled() {
    var context = this;
    if (ready) {
      ready = false;
      setTimeout(function () {
        ready = true;
        if (args) {
          throttled.apply(context);
        }
      }, wait);
      if (args) {
        func.apply(this, args);
        args = null;
      } else {
        func.apply(this, arguments);
      }
    } else {
      args = arguments;
    }
  };
};

const sendKeys = (keyFlags) => {
  if (wsConnected) {
    ws.send("d" + keyFlags.join(""));
  }
};

const throttledSendKeys = throttle(sendKeys, 10);

// Websockets
var ws = null;
var wsTimeout = 0;
var wsConnected = false;

const wsConnect = () => {
  ws = new WebSocket("ws://" + location.host + "/ws");
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    ws.send("alive?");
  };
  ws.onmessage = (e) => {
    if (e.data.byteLength) {
      updateLed(e.data);
    } else if (e.data == "alive") {
      wsTimeout = 0;
      wsConnected = true;
    }
  };
};

const wsWatch = () => {
  if (wsTimeout++ > 2) {
    wsTimeout = 0;
    ws.close();
    wsConnected = false;
    wsConnect();
    return;
  }
  if (wsConnected) {
    ws.send("alive?");
  }
};
