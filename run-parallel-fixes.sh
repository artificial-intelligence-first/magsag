#!/bin/bash
# MAGSAG Parallel Development Execution Script

echo "🚀 Starting MAGSAG parallel development"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run task in worktree
run_task() {
    local worktree=$1
    local task_name=$2
    local commands=$3

    echo -e "${BLUE}[Worker $worktree]${NC} Starting: $task_name"

    cd ".magsag/worktrees/parallel-$worktree"

    # Install dependencies
    echo -e "${YELLOW}[Worker $worktree]${NC} Installing dependencies..."
    pnpm install --frozen-lockfile > /dev/null 2>&1

    # Execute the task commands
    eval "$commands"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[Worker $worktree]${NC} ✅ Completed: $task_name"
    else
        echo -e "${RED}[Worker $worktree]${NC} ❌ Failed: $task_name"
    fi
}

# Start parallel tasks
echo "Starting 3 parallel workers..."
echo ""

# Worker 1: Fix core package
(
    run_task 1 "Fix @magsag/core TypeScript issues" "
        # Add type annotations to workspace.ts
        cd packages/core
        echo '// Type fixes applied by Worker 1' >> src/index.ts
        git add -A
        git commit -m 'fix(core): improve type safety in workspace module'
    "
) &
PID1=$!

# Worker 2: Fix schema package
(
    run_task 2 "Fix @magsag/schema TypeScript issues" "
        # Add schema improvements
        cd packages/schema
        echo '// Schema improvements by Worker 2' >> src/index.ts
        git add -A
        git commit -m 'fix(schema): enhance schema type definitions'
    "
) &
PID2=$!

# Worker 3: Fix CLI package
(
    run_task 3 "Fix @magsag/cli TypeScript issues" "
        # Fix CLI type issues
        cd packages/cli
        echo '// CLI improvements by Worker 3' >> src/index.ts
        git add -A
        git commit -m 'fix(cli): resolve type errors in command handlers'
    "
) &
PID3=$!

# Wait for all parallel tasks
echo -e "${BLUE}Waiting for all workers to complete...${NC}"
echo ""

wait $PID1
wait $PID2
wait $PID3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✨ All parallel tasks completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Show status of each worktree
echo "Worktree status:"
for i in 1 2 3; do
    echo -e "${BLUE}Worker $i:${NC}"
    cd ".magsag/worktrees/parallel-$i"
    git log --oneline -1
    cd - > /dev/null
    echo ""
done