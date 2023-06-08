use handlebars::Handlebars;
use serde_json::json;
use std::io::Write as _;
use std::{
    env::consts::ARCH,
    io::{prelude::*, BufReader},
    net::{TcpListener, TcpStream},
    thread,
};
mod threadpool;
use threadpool::ThreadPool;

fn main() {
    println!("application started");
    let listener = TcpListener::bind("0.0.0.0:3000").unwrap();
    let pool = ThreadPool::new(4);
    for stream in listener.incoming() {
        let stream = stream.unwrap();
        pool.execute(|| {
            handle_connection(stream);
        });
    }

    println!("Shutting down");
}

fn handle_connection(mut stream: TcpStream) {
    let buf_reader = BufReader::new(&mut stream);
    let http_request: Vec<_> = buf_reader
        .lines()
        .map(|result| result.unwrap())
        .take_while(|line| !line.is_empty())
        .collect();
    println!("Request is {http_request:?}");
    let request_line = &http_request[0];
    if request_line == "GET / HTTP/1.1"
        || request_line == "GET /x86 HTTP/1.1"
        || request_line == "GET /arm64 HTTP/1.1"
    {
        return_ok_response(stream);
    } else if request_line == "GET /ishealthy HTTP/1.1" {
        return_healthy(stream);
    } else {
        return_error_response(stream);
    }
}

fn build_http_response(status_line: &str, contents: String) -> String {
    let length = contents.len();
    format!("{status_line}\r\nContent-Length: {length}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{contents}")
}

fn return_ok_response(mut stream: TcpStream) {
    let status_line = "HTTP/1.1 200 OK";
    let template = "
    <!DOCTYPE html>
    <html lang=\"en\">
    <head>
        <meta charset=\"utf-8\">
        <title>Multi architecture</title>
    </head>
    <body>
        <h1>Response from {{architecture}} architecture</h1>
    </body>
    </html>
    ";
    let reg = Handlebars::new();
    let contents = reg
        .render_template(template, &json!({ "architecture": ARCH }))
        .unwrap();

    let response = build_http_response(status_line, contents);

    // the connection is closed when the function ends.
    // https://doc.rust-lang.org/stable/std/net/struct.TcpStream.html#impl-Write-for-TcpStream
    stream.write_all(response.as_bytes()).unwrap();
}

fn return_error_response(mut stream: TcpStream) {
    let status_line = "HTTP/1.1 404 NOT FOUND";
    let contents = "
    <!DOCTYPE html>
    <html lang=\"en\">
      <head>
        <meta charset=\"utf-8\">
        <title>Sorry</title>
      </head>
      <body>
        <h1>Oops!</h1>
        <p>Sorry, I don't know what you're asking for.</p>
      </body>
    </html>
    ";

    let response = build_http_response(status_line, contents.to_string());

    stream.write_all(response.as_bytes()).unwrap();
}

fn return_healthy(mut stream: TcpStream) {
    let status_line = "HTTP/1.1 200 OK";
    let contents = "
    <!DOCTYPE html>
    <html lang=\"en\">
      <head>
        <meta charset=\"utf-8\">
        <title>Healthy</title>
      </head>
      <body>
        <h1>This Rust application is operating normally.</h1>
      </body>
    </html>
    ";

    let response = build_http_response(status_line, contents.to_string());

    stream.write_all(response.as_bytes()).unwrap();
}
