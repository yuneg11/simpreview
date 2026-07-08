.PHONY: test test-backend test-frontend build build-frontend build-backend dev-backend dev-frontend

test: test-backend test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test -- --run

build: build-frontend build-backend

build-frontend:
	cd frontend && npm run build

build-backend:
	cd backend && go build -buildvcs=false -o preview ./cmd/preview

dev-backend:
	cd backend && go run ./cmd/preview --root ../docs --addr 127.0.0.1:8080 --dev

dev-frontend:
	cd frontend && npm run dev
