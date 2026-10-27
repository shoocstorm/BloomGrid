fn main() {
    // `cfg(mlx)`: MLX is built in with the assistant's native chat models (src/llm/). MLX exists only
    // for Apple Silicon; everywhere else the llm_* commands report "not supported" and the webview
    // runs models in wllama.
    println!("cargo::rustc-check-cfg=cfg(mlx)");
    let target = |k: &str| std::env::var(k).unwrap_or_default();
    if target("CARGO_CFG_TARGET_OS") == "macos" && target("CARGO_CFG_TARGET_ARCH") == "aarch64" {
        println!("cargo::rustc-cfg=mlx");
    }
    tauri_build::build()
}
