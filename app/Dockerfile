FROM rust:1.67.0 as builder
WORKDIR /app
COPY ./ /app
RUN cargo build --release

FROM gcr.io/distroless/cc
COPY --from=builder /app/target/release/playground /
EXPOSE 3000
CMD ["./playground"]