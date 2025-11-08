const handlebars = require('handlebars');

class RenderTemplateUseCase {
  constructor({ templateRepository, logger }) {
    this.templateRepository = templateRepository;
    this.logger = logger;
  }

  async execute(templateKey, channel, locale, data) {
    try {
      if (!templateKey) {
        throw new Error('templateKey is required');
      }
      if (!channel) {
        throw new Error('channel is required');
      }

      // Get template
      const template = await this.templateRepository.findByKey(
        templateKey,
        channel,
        locale || 'pt-BR'
      );

      if (!template) {
        throw new Error(`Template not found: ${templateKey} for ${channel} (${locale})`);
      }

      // Render template
      const rendered = {
        channel,
        locale: template.locale
      };

      if (template.subject) {
        const subjectTemplate = handlebars.compile(template.subject);
        rendered.subject = subjectTemplate(data || {});
      }

      if (template.body) {
        const bodyTemplate = handlebars.compile(template.body);
        rendered.body = bodyTemplate(data || {});
      }

      this.logger.debug('Template rendered', {
        templateKey,
        channel,
        locale
      });

      return rendered;
    } catch (error) {
      this.logger.error('Failed to render template', {
        error: error.message,
        templateKey,
        channel,
        locale
      });
      throw error;
    }
  }
}

module.exports = RenderTemplateUseCase;
