-- ================================================================
-- Q3-Q4 Quarterly Meeting Tasks for Colin & Andrew
-- ================================================================

-- Get account IDs for Colin and Andrew
WITH account_ids AS (
  SELECT
    (SELECT id FROM accounts WHERE email ILIKE '%colin%' LIMIT 1) as colin_id,
    (SELECT id FROM accounts WHERE email ILIKE '%andrew%' LIMIT 1) as andrew_id
)

INSERT INTO tasks (title, description, assignee_id, section_id, status, priority, channel, due)

-- COLIN'S TASKS

-- Reporting & Scorecard
SELECT 'Clean application and funded-loan source data', 'Ensure all application and funded-loan data is cleaned and ready for analysis. This blocks downstream reporting.', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-15'
UNION ALL
SELECT 'Calculate cost per funded loan and cost per closing', 'Create calculations for cost per funded loan and cost per closing. Break down by source and channel. Requires: cleaned data from Aug 15 task', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-30'
UNION ALL
SELECT 'Break results down by source and channel', 'Create detailed breakdowns of cost metrics by traffic source and marketing channel for optimization insights. Requires: cost calculations from Aug 30 task', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-15'

-- Websites & SEO
UNION ALL
SELECT 'Create list of all websites/pages for WP redirect audit', 'Compile master list of all websites and pages we want to send traffic to (excluding blogs). Share with Andrew for WP redirect audit. BLOCKING: Andrewʼs redirect audit work', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-20'
UNION ALL
SELECT 'Finish building all MedPro niche websites as subpages', 'Complete all MedPro niche websites (including self-employed) as subpages on medicalprofessionalhomeloans.com. Coordinate with Andrew on copy. Includes: new self-employed niche', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-09-30'
UNION ALL
SELECT 'Identify LLM performance tracking tool', 'Research and identify a tool to track LLM performance across our websites and initiatives.', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-08-31'
UNION ALL
SELECT 'Find test website for new template', 'Identify a lower-traffic website to test the new website template before rolling out to CRNA and MedPro sites. Criteria: not a #1 ranked page, but has decent traffic', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-10'
UNION ALL
SELECT 'Implement new website template on test site', 'Roll out new template to identified test website. Monitor for performance and ranking changes over 2-3 weeks. Watch for meaningful drops before CRNA/MedPro rollout', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-10-15'
UNION ALL
SELECT 'Finalize template and send to Andrew for copy review', 'Finalize new mortgage advisor website template and send to Andrew for copy review and messaging refinement. Requires: template review (Oct 31)', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-10-31'

-- Social Funnel
UNION ALL
SELECT 'Study Joe McCallʼs social and webinar funnel', 'Research and document Joe McCallʼs social media and webinar funnel approach. Identify best practices and frameworks.', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-08-25'
UNION ALL
SELECT 'Review six funnel experts identified by Josh', 'Analyze all six funnel experts Josh identified. Document key insights and frameworks for our funnels.', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-05'
UNION ALL
SELECT 'Compile entrepreneur lead generator list', 'Create comprehensive list of all entrepreneur lead generators currently active. Share with Andrew for funnel planning.', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-20'
UNION ALL
SELECT 'Work with Andrew on 5 lead-nurturing funnels', 'Create 5 solid lead-nurturing funnels with clear URL tracking parameters and nurturing campaigns using Joshʼs framework. Coordinate with Andrew on copy. Requires: Joshʼs framework + research from prior tasks', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-10-31'

-- Advisor Marketing
UNION ALL
SELECT 'Complete advisor visibility audits', 'Run visibility audits for all advisors. Generate actionable improvement plans for each advisorʼs online presence. UNBLOCKS: advisor website builds', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-09-30'
UNION ALL
SELECT 'Build every advisor website', 'Build individual advisor websites based on finalized template. Use visibility audit insights for content and positioning. Requires: audits (Sep 30) + template review (Oct 31)', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-11-30'
UNION ALL
SELECT 'Build seller-paid payment subsidy calculator', 'Build a seller-paid payment subsidy calculator as the lead generator for advisor websites. Coordinate with Andrew on case study completion. Requires: Andrewʼs case study (Oct 31)', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-11-15'

-- Partnerships
UNION ALL
SELECT 'Clean and simplify financial advisor prospect list', 'Audit and clean the financial advisor prospect list. Remove duplicates, outdated contacts, and inconsistent entries. UNBLOCKS: partnership assignments', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-31'
UNION ALL
SELECT 'Assign prospects across Mettle Group', 'Assign cleaned prospect list across Mettle Group members based on expertise and capacity. Create assignment recommendation document for Josh. Requires: cleaned list from Aug 31', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-09-15'
UNION ALL
SELECT 'Prepare assignment recommendation for Josh', 'Prepare detailed assignment recommendation document for Josh review. Include rationale for each assignment. Requires: assignments from Sep 15', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-09-22'
UNION ALL
SELECT 'Review final assignments with Josh', 'Schedule review meeting with Josh to finalize partnership assignments. Incorporate feedback and adjust as needed. Requires: recommendation from Sep 22', (SELECT colin_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-29'

-- ANDREW'S TASKS

-- Websites & SEO
UNION ALL
SELECT 'Audit metadata messaging using Five Laws', 'Audit metadata messaging on all pages getting impressions using the Five Laws of Marketing. Update messaging for high-impact pages. High ROI: quick wins on existing traffic', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-20'
UNION ALL
SELECT 'Rewrite CRNA homepage using Five Laws', 'Completely rewrite CRNA homepage using Five Laws framework. Make these benefits immediately visible above fold: 100% financing, No 2-year 1099 history requirement, Qualification via employment contract, Student-loan qualification solutions. Add prominent testimonial. Meta title/description should emphasize borrower outcome, not "#1 lender"', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-08-31'
UNION ALL
SELECT 'Update DPT page title and meta description', 'Update DPT page title and meta description. Add new 100% financing program information above the fold.', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-10'
UNION ALL
SELECT 'Full customer journey audit for all MedPro niches', 'Conduct full customer journey audit for all MedPro niches. Create comprehensive list of terms and phrases that should appear on each niche page for consistency and SEO. Deliver: master terminology document for each niche', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-09-30'
UNION ALL
SELECT 'Audit all active MedPro sites for program checklist', 'Audit all active MedPro sites and pages from Colinʼs master list. Ensure all pages include new MedPro program checklist: 100% financing, Loan amounts up to $2M, No mortgage insurance, Close up to 180 days before start date, Availability in all 50 states. Deliverable: completed sites checklist. Coordinate with Colin on timeline', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-10-15'

-- Social Funnels
UNION ALL
SELECT 'Study Joe McCallʼs social and webinar funnel', 'Research and document Joe McCallʼs social media and webinar funnel approach. Identify best practices and copywriting frameworks. Coordinate with Colin on research findings', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-08-25'
UNION ALL
SELECT 'Review six funnel experts identified by Josh', 'Analyze all six funnel experts Josh identified. Focus on copywriting frameworks and messaging approaches.', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-09-05'
UNION ALL
SELECT 'Create 5 lead-nurturing funnels with Josh', 'Work with Colin to create 5 solid lead-nurturing funnels with clear URL tracking parameters and nurturing campaigns using Joshʼs framework. Write all copy and email sequences. Requires: Joshʼs framework + research from prior tasks', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-10-31'

-- Advisor Marketing
UNION ALL
SELECT 'Copy review of advisor website template', 'Review Colinʼs finalized mortgage advisor website template. Provide copy feedback and messaging refinement. Ensure alignment with Five Laws framework. Requires: template from Colin (Oct 31)', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-11-15'
UNION ALL
SELECT 'Write seller-paid payment subsidy case study', 'Write complete case study demonstrating seller-paid payment subsidy program. This becomes the lead generator for advisor websites. Document real results and borrower outcomes. High priority: unblocks advisor calculator and website builds', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'High', 'Internal', '2026-10-31'
UNION ALL
SELECT 'Create nurturing sequence for subsidy funnel', 'Create complete email and nurturing sequence for seller-paid payment subsidy funnel. Include follow-up sequence and conversion touchpoints. Requires: case study from Oct 31', (SELECT andrew_id FROM account_ids), NULL, 'To Do', 'Medium', 'Internal', '2026-11-15';
