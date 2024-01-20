#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <remote-name> <contributor-username> <branch-name>"
    exit 1
fi

REMOTE_NAME=$1
CONTRIBUTOR_USERNAME=$2
BRANCH_NAME=$3
NEW_LOCAL_BRANCH_NAME="${CONTRIBUTOR_USERNAME}-${BRANCH_NAME}"

# Adding the contributor's repository as a remote (if not already added)
if ! git remote | grep -q "$CONTRIBUTOR_USERNAME"; then
    echo "Adding remote for contributor $CONTRIBUTOR_USERNAME..."
    git remote add "$CONTRIBUTOR_USERNAME" "https://github.com/$CONTRIBUTOR_USERNAME/dittofeed.git"
fi

# Fetching the branch from the contributor's repository
echo "Fetching from $CONTRIBUTOR_USERNAME..."
git fetch "$CONTRIBUTOR_USERNAME"

# Checking out the branch as a new local branch with a unique name
echo "Checking out the branch $BRANCH_NAME as $NEW_LOCAL_BRANCH_NAME..."
git checkout -b "$NEW_LOCAL_BRANCH_NAME" "$CONTRIBUTOR_USERNAME/$BRANCH_NAME"

echo "Branch $NEW_LOCAL_BRANCH_NAME has been checked out."
