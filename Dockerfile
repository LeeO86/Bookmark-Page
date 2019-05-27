FROM php:7.2-apache 
RUN chown -R www-data:www-data /var/www/html
RUN docker-php-ext-install mysqli