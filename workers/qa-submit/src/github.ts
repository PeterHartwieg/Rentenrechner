interface CreatedIssue {
  number: number;
  html_url: string;
}

export async function createIssue(
  pat: string,
  repo: string,
  title: string,
  body: string,
  labels: string[],
): Promise<CreatedIssue | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${pat}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "rentenwiki-qa-submit",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) return null;
  return (await response.json()) as CreatedIssue;
}
