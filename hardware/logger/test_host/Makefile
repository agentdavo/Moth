# Host unit tests for the pure logic in lib/saillog (no Arduino, no hardware).
#   make -C hardware/logger/test_host        build and run
#   make -C hardware/logger/test_host asan   (with sanitizers)
#   make -C hardware/logger/test_host clean
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O1 -g -Wall -Wextra -Werror -Wno-unused-parameter -pthread
SRC_DIR := ../lib/saillog/src
SRCS := $(wildcard $(SRC_DIR)/*.cpp) test_main.cpp
BIN := build/saillog_tests

.PHONY: all test asan clean
all: test

$(BIN): $(SRCS) $(wildcard $(SRC_DIR)/*.h) test_util.h
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -I$(SRC_DIR) $(SRCS) -o $@

test: $(BIN)
	./$(BIN)

# Same tests under AddressSanitizer + UndefinedBehaviorSanitizer.
asan: $(SRCS)
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -fsanitize=address,undefined -fno-sanitize-recover=undefined -I$(SRC_DIR) $(SRCS) -o build/saillog_tests_asan
	./build/saillog_tests_asan

clean:
	rm -rf build
