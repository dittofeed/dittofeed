#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <remote-name> <contributor-username> <branch-name>"
    exit 1
fi

REMOTE_NAME=$1
CONTRIBUTOR_USERNAME=$2
BRANCH_NAME=$3

# Adding the contributor's repository as a remote (if not already added)
if ! git remote | grep -q "$CONTRIBUTOR_USERNAME"; then
    echo "Adding remote for contributor $CONTRIBUTOR_USERNAME..."
    git remote add "$CONTRIBUTOR_USERNAME" "https://github.com/$CONTRIBUTOR_USERNAME/dittofeed.git"
fi

# Fetching the pull request branch
echo "Fetching from $CONTRIBUTOR_USERNAME..."
git fetch "$CONTRIBUTOR_USERNAME"

# Checking out the branch as a new local branch
echo "Checking out the branch $BRANCH_NAME..."
git checkout -b "$BRANCH_NAME" "$CONTRIBUTOR_USERNAME/$BRANCH_NAME"

echo "Branch $BRANCH_NAME has been checked out."
