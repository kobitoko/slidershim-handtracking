// Example taken from https://google.github.io/mediapipe/solutions/hands.html#javascript-solution-api
// or at my fork https://github.com/kobitoko/mediapipe/blob/master/docs/solutions/hands.md#javascript-solution-api
// since google said the web page will be removed on April 3, 2023 for a new MediaPipe Solution at https://developers.google.com/mediapipe/solutions/guide#legacy
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
const hFlip = document.getElementById("hFlip");
const trackingConfidence = document.getElementById("trackingConfidence");
const detectionConfidence = document.getElementById("detectionConfidence");
const complexModel = document.getElementById("complexModel");

let paused = false;
let cameraRenderer = true;
let horizontalFlip = true;
let hand0 = {};
let hand1 = {};
let lastHandValue0 = -1;
let lastHandValue1 = -1;
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
  // Update horizontal flip.
  hFlip.textContent = params.selfieMode
    ? "Unflip Camera Horizontally"
    : "Flip Camera Horizontally";
  // Update min tracking confidence.
  trackingConfidence.value = params.minTrackingConfidence;
  // Update min detection confidence.
  detectionConfidence.value = params.minDetectionConfidence;
  // Update model complexity.
  complexModel.value = params.modelComplexity;
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
    cameraRenderer = !cameraRenderer;
    cameraButton.textContent = cameraRenderer
      ? "Disable Camera Renderer"
      : "Enable Camera Renderer";
  });
  // Update horizontal flip.
  hFlip.addEventListener("click", () => {
    horizontalFlip = !horizontalFlip;
    hFlip.textContent = horizontalFlip
      ? "Unflip Camera Horizontally"
      : "Flip Camera Horizontally";
    hands.setOptions({ selfieMode: horizontalFlip });
    window.localStorage.setItem("hFlip", horizontalFlip);
  });
  // Update min tracking confidence.
  trackingConfidence.addEventListener("change", () => {
    const newValue = Number(clamp(trackingConfidence.value, 0.05, 1));
    hands.setOptions({ minTrackingConfidence: newValue });
    trackingConfidence.value = newValue;
    window.localStorage.setItem("trackingConfidence", newValue);
  });
  // Update min detection confidence.
  detectionConfidence.addEventListener("change", () => {
    const newValue = Number(clamp(detectionConfidence.value, 0.05, 1));
    hands.setOptions({ minDetectionConfidence: newValue });
    detectionConfidence.value = newValue;
    window.localStorage.setItem("detectionConfidence", newValue);
  });
  // Update model complexity.
  complexModel.addEventListener("change", () => {
    const newValue = Number(clamp(Math.round(complexModel.value), 0, 1));
    hands.setOptions({ modelComplexity: newValue });
    complexModel.value = newValue;
    window.localStorage.setItem("complexModel", newValue);
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
  const handValue0 = getAirZoneValue(hand0);
  const handValue1 = getAirZoneValue(hand1);
  if (handValue0 != lastHandValue0 || handValue1 != lastHandValue1) {
    updateTouches(handValue0, handValue1);
  }
  showResults(handValue0, handValue1);
  lastHandValue0 = handValue0;
  lastHandValue1 = handValue1;
}

function showResults(handValue0, handValue1) {
  if (cameraRenderer) {
    canvasOffset = canvas.getBoundingClientRect();
    zone.style.left = canvasOffset.left + "px";
    zone.style.width = canvasOffset.width + "px";
    if (hand0?.side != null) {
      circle.style.transform = setStyleTransform(hand0);
    }
    if (hand1?.side != null) {
      circle2.style.transform = setStyleTransform(hand1);
    }
  }
  height.textContent = handValue0 + ", " + handValue1;
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
  if (!!results.multiHandLandmarks) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      // An array len 2 (if 2 hands). Consisting of an array of 21 landmarks object: x,y,z,visibility.
      let hand = {};
      const currentHand = results.multiHandLandmarks[i];
      for (const [k, definition] of Object.entries(results.multiHandedness)) {
        // An object with displayName: undefined, index: 0, label: "Left" or "Right", score: 0.989}
        if (definition.index === i) {
          hand.side = definition.label;
          break;
        }
      }
      if (currentHand.length > 9) {
        // Center of hand approximation is landmark 0 (hand start) and 9 (middle finger knuckle).
        hand.x = (currentHand[0].x + currentHand[9].x) / 2;
        hand.y = (currentHand[0].y + currentHand[9].y) / 2;
        if (i === 0) {
          hand0 = hand;
        } else if (i === 1) {
          hand1 = hand;
        }
      }
    }
    updateHands();
  }
  if (cameraRenderer && !!results.multiHandLandmarks) {
    // Drawing camera view + hand tracking
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
      results.image,
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );

    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 2,
      });
      drawLandmarks(canvasCtx, landmarks, { color: "#0000FF", lineWidth: 2 });
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

// Start the hand tracking!
const hands = new Hands({
  locateFile: (file) => {
    console.log("looking for:", `lib/hands/${file}`);
    return `lib/hands/${file}`;
  },
});
const params = {
  selfieMode: "true" === getSavedOrDefault("hFlip", "true"),
  maxNumHands: 2,
  minTrackingConfidence: Number(getSavedOrDefault("trackingConfidence", 0.1)),
  minDetectionConfidence: Number(
    getSavedOrDefault("detectionConfidence", 0.25)
  ),
  modelComplexity: Number(getSavedOrDefault("complexModel", 0)),
};
updateInput(params);
// Set up listeners after updating the input.
initializeListeners();
hands.setOptions(params);
hands.onResults(onResults);
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  facingMode: "user",
  width: canvasElement.width,
  height: canvasElement.height,
});
wsConnect();
setInterval(wsWatch, 1000);
camera.start();
