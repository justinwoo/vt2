import (builtins.fetchTarball {
  # Descriptive name to make the store path easier to identify
  name = "nixpkgs-23.11";
  # Commit hash for nixos-unstable as of 2018-09-12
  url = "https://github.com/NixOS/nixpkgs/archive/refs/tags/23.11.tar.gz";
  # Hash obtained using `nix-prefetch-url --unpack <url>`
  sha256 = "1ndiv385w1qyb3b18vw13991fzb9wg4cl21wglk89grsfsnra41k";
}) {}
