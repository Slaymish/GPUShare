export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDetail extends SkillSummary {
  content: string;
}
