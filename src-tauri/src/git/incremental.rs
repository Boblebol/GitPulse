use git2::{Repository, Revwalk, Sort};

/// Configure a revwalk starting from a specified branch, walking oldest-first.
/// If `since_sha` is provided (incremental scan), commits reachable from
/// that SHA are hidden — only new commits are returned.
pub fn setup_revwalk<'repo>(
    repo: &'repo Repository,
    active_branch: &str,
    since_sha: Option<&str>,
) -> Result<Revwalk<'repo>, git2::Error> {
    let mut walk = repo.revwalk()?;

    // Try to push the specified branch. If it fails (e.g. detached HEAD or branch doesn't exist),
    // fall back to HEAD.
    let branch_ref = format!("refs/heads/{}", active_branch);
    match walk.push_ref(&branch_ref) {
        Ok(_) => {}
        Err(_) => {
            // Fallback to HEAD if the branch ref doesn't exist
            walk.push_head()?;
        }
    }

    // Oldest-first so we can insert in chronological order.
    walk.set_sorting(Sort::TIME | Sort::REVERSE)?;

    if let Some(sha) = since_sha {
        let oid = git2::Oid::from_str(sha)?;
        walk.hide(oid)?;
    }

    Ok(walk)
}
