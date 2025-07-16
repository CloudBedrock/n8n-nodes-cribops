const gulp = require('gulp');

gulp.task('build:icons', function() {
  // Copy icons to nodes directory
  gulp.src('nodes/**/*.{png,svg}')
    .pipe(gulp.dest('dist/nodes'));
    
  // Also copy the main cribops icon to credentials directory
  return gulp.src('nodes/Cribops/cribops.svg')
    .pipe(gulp.dest('dist/credentials'));
});