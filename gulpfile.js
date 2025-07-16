const gulp = require('gulp');

gulp.task('build:icons', function() {
  // Copy icons to nodes directory only
  return gulp.src('nodes/**/*.{png,svg}')
    .pipe(gulp.dest('dist/nodes'));
});