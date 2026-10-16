import hashlib
from pathlib import Path

# This exact SDK still fails on the current Json BLC before deserialization.
# Never assume that a replacement JAR needs the same parser workaround.
_BLC_COMPAT_SHA256 = "a5705238a0ed48953b8a12d2146150316ad9b870c0ae42cf6f77fdd15620df68"


def sdk_command(
    java: str, sdk: Path, runner: Path | None = None, *, work_root: Path,
) -> list[str]:
    """Use native SDK behavior except for an explicitly identified broken build."""
    command = [
        java, "-Xmx32G", "--enable-native-access=ALL-UNNAMED",
        "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8",
    ]
    if runner is not None and not runner.is_file():
        raise FileNotFoundError(f"SDK 启动源文件不存在：{runner}")
    digest = hashlib.sha256()
    with sdk.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() == _BLC_COMPAT_SHA256:
        launcher = Path(__file__).with_name("BeyondSdkCompatLauncher.java")
        parser = launcher.with_name("AkeVfsCompat.java")
        for source in (launcher, parser):
            if not source.is_file():
                raise FileNotFoundError(f"已知 SDK 所需 BLC 兼容源文件不存在：{source}")
        return command + [
            str(launcher), str(sdk), str(work_root / "sdk-compat"), str(parser),
            str(runner) if runner else "-",
        ]
    if runner is None:
        return command + ["-jar", str(sdk)]
    return command + ["--class-path", str(sdk), str(runner)]
