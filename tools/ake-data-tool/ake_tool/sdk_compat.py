from pathlib import Path


def compat_command(java: str, sdk: Path, run_root: Path, runner: Path | None = None) -> list[str]:
    """Build the shared image/Json launch command; compilation happens when run."""
    source = Path(__file__).with_name("BeyondSdkCompatLauncher.java")
    parser = source.with_name("AkeVfsCompat.java")
    for required in (source, parser, *([runner] if runner else [])):
        if not required.is_file():
            raise FileNotFoundError(f"SDK 兼容启动源文件不存在：{required}")
    return [
        java, "-Xmx32G", "--enable-native-access=ALL-UNNAMED",
        str(source), str(sdk), str(run_root / "sdk-compat"), str(parser),
        str(runner) if runner else "-",
    ]
