{
  description = "Development shell with Node.js 24 LTS";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux"; # Cambia según tu sistema, p. ej., aarch64-darwin
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_24
          pnpm
          postgresql_18
          infisical
          valkey
        ];

        shellHook = ''
          echo "> Node.js: $(node --version)"
          echo "> pnpm: $(pnpm --version)"
          echo "> PostgreSQL: $(psql --version)"
          echo "> Valkey: $(valkey-cli --version | head -n 1)"
          echo "> Shell ready"
        '';
      };
    };
}
