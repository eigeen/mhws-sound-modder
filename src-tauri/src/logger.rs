use crate::event::{self, SystemEventSender};

pub struct Logger {
    sender: SystemEventSender,
}

impl Logger {
    pub fn new(sender: SystemEventSender) -> Self {
        Self { sender }
    }

    pub fn init() {
        let sender = event::SystemEventSender::new();
        let logger = Logger::new(sender);
        log::set_boxed_logger(Box::new(logger)).unwrap();
        log::set_max_level(log::LevelFilter::Debug);
    }
}

impl log::Log for Logger {
    fn enabled(&self, _metadata: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        match record.level() {
            log::Level::Error => {
                println!("[ERROR] {}", record.args());
                self.sender.log(event::LogLevel::Error, record.args());
            }
            log::Level::Warn => {
                println!("[WARN] {}", record.args());
                self.sender.log(event::LogLevel::Warn, record.args());
            }
            log::Level::Info => {
                println!("[INFO] {}", record.args());
                self.sender.log(event::LogLevel::Info, record.args());
            }
            log::Level::Debug => {
                println!("[DEBUG] {}", record.args());
                self.sender.log(event::LogLevel::Debug, record.args());
            }
            log::Level::Trace => {
                println!("[TRACE] {}", record.args());
            }
        }
    }

    fn flush(&self) {}
}
