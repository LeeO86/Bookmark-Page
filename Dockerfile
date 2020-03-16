FROM php:7.4-apache
RUN a2enmod expires
COPY --chown=www-data:www-data ./www /var/www/html
RUN docker-php-ext-install mysqli