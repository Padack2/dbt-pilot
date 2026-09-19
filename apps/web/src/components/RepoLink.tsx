export function RepoLink({ repoName, title }: { repoName: string; title?: string }) {
  return (
    <a
      href={`https://github.com/${repoName}`}
      target="_blank"
      rel="noopener noreferrer"
      className="repo-link"
      title={title}
    >
      {repoName}
    </a>
  );
}
