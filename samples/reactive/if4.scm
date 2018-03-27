(cons
 "before-"
 (cons
  (if (eqv? (mod (input test) 2) 0)
      (cons "even" (cons (input test) '()))
      (cons "odd" (cons (input test) '())))
  (cons "-after" '())))
