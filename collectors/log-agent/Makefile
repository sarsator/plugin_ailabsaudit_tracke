.PHONY: build test clean release

BINARY = ailabsaudit-agent
VERSION = 1.0.0
LDFLAGS = -s -w -X main.version=$(VERSION)

build:
	CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o $(BINARY) .

test:
	go test -v -race ./...

clean:
	rm -f $(BINARY) $(BINARY)-linux-*

release: clean
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $(BINARY)-linux-amd64 .
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $(BINARY)-linux-arm64 .
	@echo ""
	@echo "Binaries built:"
	@ls -lh $(BINARY)-linux-*
	@echo ""
	@echo "Upload to GitHub Releases:"
	@echo "  gh release create v$(VERSION) $(BINARY)-linux-amd64 $(BINARY)-linux-arm64 --title 'v$(VERSION)' --notes 'Log Agent v$(VERSION)'"
