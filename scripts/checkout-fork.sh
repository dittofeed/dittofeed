#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <contributor:branch>"
    exit 1
fi

CONTRIBUTOR_BRANCH=$1

# Splitting the contributor and branch from the input
IFS=':' read -ra ADDR <<< "$CONTRIBUTOR_BRANCH"
CONTRIBUTOR_USERNAME=${ADDR[0]}
BRANCH_NAME=${ADDR[1]}
NEW_LOCAL_BRANCH_NAME="${CONTRIBUTOR_USERNAME}-${BRANCH_NAME}"

# Check if both contributor and branch names are provided
if [ -z "$CONTRIBUTOR_USERNAME" ] || [ -z "$BRANCH_NAME" ]; then
    echo "Error: Invalid input. Please use the format <contributor:branch>"
    exit 1
fi

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
