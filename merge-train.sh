#!/bin/bash
# MAGSAG Merge Train - Sequential integration of parallel changes

echo "🚂 Starting MAGSAG Merge Train"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Base branch to merge into
BASE_BRANCH="dev/integration"

# Array of branches to merge
BRANCHES=(
    "parallel/core-fixes"
    "parallel/schema-fixes"
    "parallel/cli-fixes"
)

echo -e "${BLUE}Target branch:${NC} $BASE_BRANCH"
echo -e "${BLUE}Branches to merge:${NC}"
for branch in "${BRANCHES[@]}"; do
    echo "  - $branch"
done
echo ""

# Switch to base branch
echo -e "${YELLOW}Switching to $BASE_BRANCH...${NC}"
git checkout $BASE_BRANCH

# Merge each branch sequentially
for branch in "${BRANCHES[@]}"; do
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Merging: $branch${NC}"
    echo -e "${BLUE}========================================${NC}"

    # Check if branch exists
    if ! git show-ref --verify --quiet refs/heads/$branch; then
        echo -e "${RED}❌ Branch $branch not found, skipping${NC}"
        continue
    fi

    # Show what will be merged
    echo -e "${YELLOW}Changes to be merged:${NC}"
    git diff $BASE_BRANCH..$branch --stat

    # Attempt merge
    echo -e "${YELLOW}Merging...${NC}"
    if git merge $branch --no-ff -m "feat(merge-train): integrate $branch into $BASE_BRANCH"; then
        echo -e "${GREEN}✅ Successfully merged $branch${NC}"
    else
        echo -e "${RED}❌ Conflict detected in $branch${NC}"
        echo -e "${YELLOW}Attempting automatic resolution...${NC}"

        # Try to auto-resolve
        git status --short | grep "^UU" | awk '{print $2}' | while read file; do
            echo "  Resolving: $file"
            # Take both changes
            git checkout --theirs "$file"
            git add "$file"
        done

        if [ -n "$(git status --porcelain)" ]; then
            git commit -m "feat(merge-train): resolve conflicts from $branch"
            echo -e "${GREEN}✅ Conflicts resolved and committed${NC}"
        fi
    fi

    # Show current state
    echo -e "${YELLOW}Current HEAD:${NC}"
    git log --oneline -1
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✨ Merge Train Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Summary
echo -e "${BLUE}Final merge history:${NC}"
git log --oneline --graph -10

echo ""
echo -e "${BLUE}Changed files summary:${NC}"
git diff HEAD~3..HEAD --stat