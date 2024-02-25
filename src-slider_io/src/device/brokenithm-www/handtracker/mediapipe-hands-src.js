import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "./lib/tasks-vision/vision_bundle.mjs";

// Example reference used found in https://developers.google.com/mediapipe/solutions/vision/hand_landmarker/web_js#video
// official code example: https://codepen.io/mediapipe-preview/pen/gOKBGPN
const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("canvas");
const canvasCtx = canvasElement.getContext("2d");

const circle = document.getElementById("circle");
const circle2 = document.getElementById("circle2");
const zone = document.getElementById("zone");
const height = document.getElementById("zoneValue");
const customHeight = document.getElementById("customHeight");
let canvasOffset = null;

const pauseButton = document.getElementById("pauseButton");
const trackingConfidence = document.getElementById("trackingConfidence");
const detectionConfidence = document.getElementById("detectionConfidence");
const handPresenceConfidence = document.getElementById(
  "handPresenceConfidence"
);

let handLandmarker = undefined;
let drawingUtils = undefined;
let lastVideoTime = -1;

let paused = false;
let handDetectionRender = true;
let rightHand = {};
let leftHand = {};
let lastRightHandAirValue = -1;
let lastLeftHandAirValue = -1;
let zoneHeight = 200;
let zoneLevels = zoneHeight / 6;

function clamp(input, min, max) {
  if (input < min) {
    return min;
  }
  if (input > max) {
    return max;
  }
  return input;
}

function getSavedOrDefault(key, defaultValue) {
  const saved = window.localStorage.getItem(key);
  if (saved === null) {
    return defaultValue;
  }
  return saved;
}

function updateInput(params) {
  // Update height zone.
  zoneHeight = Number(getSavedOrDefault("customHeight", zoneHeight));
  zoneLevels = zoneHeight / 6;
  customHeight.value = zoneHeight;
  zone.style.height = zoneHeight + "px";
  // Update min tracking confidence.
  trackingConfidence.value = params.minTrackingConfidence;
  // Update min detection confidence.
  detectionConfidence.value = params.minHandDetectionConfidence;
  // Update min hand presence confidence.
  handPresenceConfidence.value = params.minHandPresenceConfidence;
}

function initializeListeners() {
  // Height zone input listener
  customHeight.addEventListener("change", () => {
    const newValue = Number(clamp(customHeight.value, 1, canvasElement.height));
    zoneHeight = newValue;
    zoneLevels = zoneHeight / 6;
    zone.style.height = zoneHeight + "px";
    customHeight.value = newValue;
    window.localStorage.setItem("customHeight", newValue);
  });
  // Pause sending input to slidershim
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Paused" : "Running";
  });
  // Disable rendering the camera renderer, saves some CPU probably.
  cameraButton.addEventListener("click", () => {
    handDetectionRender = !handDetectionRender;
    cameraButton.textContent = handDetectionRender
      ? "Disable Hand Detection Render"
      : "Enable Hand Detection Render";
  });
  // Update min tracking confidence.
  trackingConfidence.addEventListener("change", async () => {
    const newValue = Number(clamp(trackingConfidence.value, 0.05, 1));
    trackingConfidence.value = newValue;
    window.localStorage.setItem("minTrackingConfidence", newValue);
    handLandmarker.setOptions({ minTrackingConfidence: newValue });
  });
  // Update min detection confidence.
  detectionConfidence.addEventListener("change", async () => {
    const newValue = Number(clamp(detectionConfidence.value, 0.05, 1));
    detectionConfidence.value = newValue;
    window.localStorage.setItem("minHandDetectionConfidence", newValue);
    handLandmarker.setOptions({ minHandDetectionConfidence: newValue });
  });
  // Update handPresenceConfidence.
  handPresenceConfidence.addEventListener("change", async () => {
    const newValue = Number(clamp(handPresenceConfidence.value, 0.05, 1));
    handPresenceConfidence.value = newValue;
    window.localStorage.setItem("minHandPresenceConfidence", newValue);
    handLandmarker.setOptions({ minHandPresenceConfidence: newValue });
  });
}

function getAirZoneValue(hand) {
  // x and y are normalized to [0.0, 1.0] by the image width and height respectively.
  const handHeight = hand.y * canvasElement.height;
  if (handHeight > zoneHeight) {
    return -1;
  }
  // kflag is 0-5
  return 5 - Math.floor(handHeight / zoneLevels);
}

function updateHands() {
  const rightHandAirValue = getAirZoneValue(rightHand);
  const leftHandAirValue = getAirZoneValue(leftHand);
  if (
    rightHandAirValue != lastRightHandAirValue ||
    leftHandAirValue != lastLeftHandAirValue
  ) {
    updateTouches(rightHandAirValue, leftHandAirValue);
  }
  showResults(rightHandAirValue, leftHandAirValue);
  lastRightHandAirValue = rightHandAirValue;
  lastLeftHandAirValue = leftHandAirValue;
}

function showResults(rightHandAirValue, leftHandAirValue) {
  if (handDetectionRender) {
    canvasOffset = canvas.getBoundingClientRect();
    zone.style.left = canvasOffset.left + "px";
    zone.style.width = canvasOffset.width + "px";
    // instead of actual side check, just see if it exists. Occasionally left/right swaps when confidence is lower.
    if (rightHand?.sideIndex != null) {
      circle.style.transform = setStyleTransform(rightHand);
    }
    if (leftHand?.sideIndex != null) {
      circle2.style.transform = setStyleTransform(leftHand);
    }
  }
  height.textContent = rightHandAirValue + ", " + leftHandAirValue;
}

function setStyleTransform(hand) {
  return (
    "translate3d(" +
    (canvasOffset.left + hand.x * canvasOffset.width) +
    "px," +
    (canvasOffset.top + hand.y * canvasOffset.height - canvasOffset.top) +
    "px, 0)"
  );
}

function onResults(results) {
  if (!!results.landmarks && results.landmarks.length > 0) {
    for (let i = 0; i < results.landmarks.length; i++) {
      // An array len 2 (if 2 hands). Consisting of an array of 21 landmarks object: x,y,z.
      let hand = {};
      const currentHand = results.landmarks[i];
      if (!!results.handedness && results.handedness.length > 0) {
        // results.handedness is Category[][]
        for (const handEntry of results.handedness) {
          // handEntry is an array of objects, so lets look inside that object. Unsure if this is ever more than 1 entry.
          // [{score: 0.90789794921875, index: 1, categoryName: 'Left', displayName: 'Left'}]
          let entryMatched = false;
          for (const entry of handEntry) {
            if (entry.index == i) {
              hand.sideIndex = entry.index;
              hand.name = entry.categoryName;
              entryMatched = true;
              break;
            }
          }
          if (entryMatched) {
            break;
          }
        }
      } else {
        console.warn(
          "Result Landmarks exists, but no handednesses information exists.",
          results
        );
      }
      if (currentHand.length > 9) {
        // Center of hand approximation is landmark 0 (hand start) and 9 (middle finger knuckle).
        hand.x = (currentHand[0].x + currentHand[9].x) / 2;
        hand.y = (currentHand[0].y + currentHand[9].y) / 2;
        if (hand.sideIndex === 1) {
          leftHand = hand;
        } else {
          // default to right hand.
          rightHand = hand;
        }
      }
    }
    updateHands();
  }
  if (handDetectionRender && !!results.landmarks) {
    // Drawing camera view + hand tracking
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    for (const landmarks of results.landmarks) {
      drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
        color: "#00AA00",
        lineWidth: 2,
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#00FF00",
        lineWidth: 1,
      });
    }
    canvasCtx.restore();
  }
}

// Initially taken from brokenithm src.js

// Button State
// prettier-ignore
var lastState = [0, 0, 0, 0, 0, 0];

function updateTouches(hand0, hand1) {
  if (paused) {
    return;
  }
  try {
    // prettier-ignore
    let keyFlags = [0, 0, 0, 0, 0, 0];

    if (hand0 > -1) {
      keyFlags[hand0] = 1;
    }
    if (hand1 > -1) {
      keyFlags[hand1] = 1;
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

const params = {
  numHands: 2,
  minTrackingConfidence: Number(
    getSavedOrDefault("minTrackingConfidence", 0.1)
  ),
  minHandPresenceConfidence: Number(
    getSavedOrDefault("minHandPresenceConfidence", 0.5)
  ),
  minHandDetectionConfidence: Number(
    getSavedOrDefault("minHandDetectionConfidence", 0.25)
  ),
  baseOptions: {
    modelAssetPath: "lib/hand-landmarker_float_16/hand_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
};

// Before we can use HandLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
async function initializeHandTracking() {
  updateInput(params);
  // Set up listeners after updating the input.
  initializeListeners();
  drawingUtils = new DrawingUtils(canvasCtx);
  const vision = await FilesetResolver.forVisionTasks("lib/tasks-vision/wasm");
  handLandmarker = await HandLandmarker.createFromOptions(vision, params);
}

function startCamera() {
  // Check if webcam access is supported.
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error("getUserMedia() is not supported by your browser");
    alert("getUserMedia() is not supported by your browser");
    return;
  }
  if (!handLandmarker) {
    console.error("hand landmarker failed to be created...");
    return;
  }
  const UsermediaParam = { video: true };
  navigator.mediaDevices.getUserMedia(UsermediaParam).then((stream) => {
    videoElement.addEventListener("loadeddata", mainLoop);
    // Set the canvas to the right size according to the video.
    videoElement.addEventListener("loadedmetadata", () => {
      canvasElement.height = videoElement.videoHeight;
      canvasElement.width = videoElement.videoWidth;
    });
    videoElement.srcObject = stream;
  });
}

function mainLoop() {
  let startTimeMs = performance.now();
  if (lastVideoTime !== videoElement.currentTime) {
    lastVideoTime = videoElement.currentTime;
    let results = handLandmarker.detectForVideo(videoElement, startTimeMs);
    onResults(results);
  }
  // its a loop, call again.
  window.requestAnimationFrame(mainLoop);
}

wsConnect();
setInterval(wsWatch, 1000);

initializeHandTracking().then(() => {
  startCamera();
});
