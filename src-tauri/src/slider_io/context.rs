use atomic_float::AtomicF64;
use log::info;
use std::sync::{atomic::Ordering, Arc};

use crate::slider_io::{
  brokenithm::BrokenithmJob,
  config::{Config, DeviceMode, LedMode, OutputMode},
  controller_state::FullState,
  device::HidDeviceJob,
  led::LedJob,
  output::OutputJob,
  utils::LoopTimer,
  worker::{AsyncWorker, ThreadWorker},
};

#[allow(dead_code)]
pub struct Context {
  state: FullState,
  config: Config,
  device_worker: Option<ThreadWorker>,
  brokenithm_worker: Option<AsyncWorker>,
  output_worker: Option<ThreadWorker>,
  led_worker: Option<ThreadWorker>,
  timers: Vec<(&'static str, Arc<AtomicF64>)>,
}

impl Context {
  pub fn new(config: Config) -> Self {
    info!("Context creating");
    info!("Device config {:?}", config.device_mode);
    info!("Output config {:?}", config.output_mode);
    info!("LED config {:?}", config.led_mode);

    let state = FullState::new();
    let mut timers = vec![];

    let (device_worker, brokenithm_worker) = match &config.device_mode {
      DeviceMode::None => (None, None),
      DeviceMode::Brokenithm {
        ground_only,
        led_enabled,
      } => (
        None,
        Some(AsyncWorker::new(
          "brokenithm",
          BrokenithmJob::new(&state, ground_only, led_enabled),
        )),
      ),
      _ => (
        {
          let timer = LoopTimer::new();
          timers.push(("d", timer.fork()));
          Some(ThreadWorker::new(
            "device",
            HidDeviceJob::from_config(&state, &config.device_mode),
            timer,
          ))
        },
        None,
      ),
    };
    let output_worker = match &config.output_mode {
      OutputMode::None => None,
      _ => {
        let timer = LoopTimer::new();
        timers.push(("o", timer.fork()));
        Some(ThreadWorker::new(
          "output",
          OutputJob::new(&state, &config.output_mode),
          timer,
        ))
      }
    };
    let led_worker = match &config.led_mode {
      LedMode::None => None,
      _ => {
        let timer = LoopTimer::new();
        timers.push(("l", timer.fork()));
        Some(ThreadWorker::new(
          "led",
          LedJob::new(&state, &config.led_mode),
          timer,
        ))
      }
    };

    Self {
      state,
      config,
      device_worker,
      brokenithm_worker,
      output_worker,
      led_worker,
      timers,
    }
  }

  pub fn clone_state(&self) -> FullState {
    self.state.clone()
  }

  pub fn timer_state(&self) -> String {
    self
      .timers
      .iter()
      .map(|(s, f)| format!("{}:{:.1}/s", s, f.load(Ordering::SeqCst)))
      .collect::<Vec<String>>()
      .join(" ")
  }
}