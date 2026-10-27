// Command guardrail runs the proxy, signs its config, and reads its ledger.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"guardrail/internal/audit"
	"guardrail/internal/config"
	"guardrail/internal/server"
	"guardrail/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "serve":
		serve(os.Args[2:])
	case "sign":
		sign(os.Args[2:])
	case "stats":
		stats(os.Args[2:])
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `guardrail: self-contained LLM guardrails proxy

  guardrail serve [-config config.yaml] [-dev]
  guardrail sign  [-key guardrail_ed25519.priv] [config.yaml]
  guardrail stats [-db guardrail.db]
`)
}

func serve(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	path := fs.String("config", "config.yaml", "path to the YAML config")
	dev := fs.Bool("dev", false, "write an access log to stderr")
	_ = fs.Parse(args)

	cfg, raw, err := config.Load(*path)
	if err != nil {
		fail("cannot load config", err)
	}
	if err := config.CheckAccept(cfg, raw); err != nil {
		fail("refusing to start", err)
	}
	if !cfg.Security.Tamper {
		warnUnsigned(cfg, raw)
	}
	log.Printf("config loaded path=%s sha256=%s", cfg.SourcePath, cfg.SourceHash)
	if cfg.Security.Tamper {
		log.Printf("config signature verified key=%s", cfg.Security.TamperKeyFile)
	} else {
		log.Printf("tamper checking is off; this config is not required to be signed")
	}

	srv, err := server.Build(cfg, *dev)
	if err != nil {
		fail("cannot start server", err)
	}
	log.Printf("data plane listening on %s, admin plane on %s", cfg.Listen, server.AdminAddr)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := srv.Run(ctx); err != nil {
		fail("server stopped", err)
	}
	log.Printf("shut down cleanly")
}

// warnUnsigned still reports a broken signature when tamper is off, so a
// developer notices a stale .sig instead of silently running modified config.
func warnUnsigned(cfg *config.Config, raw []byte) {
	if cfg.Security.TamperKeyFile == "" {
		return
	}
	pub, err := config.LoadPublicKey(cfg.Security.TamperKeyFile)
	if err != nil {
		return
	}
	if err := config.Verify(pub, cfg.SourcePath, raw); err != nil {
		log.Printf("warning: %v", err)
	}
}

func sign(args []string) {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	keyPath := fs.String("key", "guardrail_ed25519.priv", "path to the ed25519 private key (created if missing)")
	_ = fs.Parse(args)
	cfgPath := "config.yaml"
	if fs.NArg() > 0 {
		cfgPath = fs.Arg(0)
	}
	pub, err := config.Sign(*keyPath, cfgPath)
	if err != nil {
		fail("signing failed", err)
	}
	fmt.Printf("signed %s\n  signature: %s\n  public key: %s\n", cfgPath, config.SignPath(cfgPath), pub)
	fmt.Printf("point security.tamper_key_file at %s\n", pub)
}

func stats(args []string) {
	fs := flag.NewFlagSet("stats", flag.ExitOnError)
	dbPath := fs.String("db", "guardrail.db", "path to the SQLite database")
	_ = fs.Parse(args)

	if _, err := os.Stat(*dbPath); err != nil {
		fail("cannot read database", err)
	}
	db, err := store.Open(*dbPath)
	if err != nil {
		fail("cannot open database", err)
	}
	defer db.Close()
	s, err := audit.Aggregate(db)
	if err != nil {
		fail("cannot aggregate audit log", err)
	}
	out, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		fail("cannot render stats", err)
	}
	fmt.Println(string(out))
}

func fail(prefix string, err error) {
	if errors.Is(err, flag.ErrHelp) {
		os.Exit(0)
	}
	fmt.Fprintf(os.Stderr, "%s: %v\n", prefix, err)
	os.Exit(1)
}
