;;; Alternate between two different lambda expressions as for the procedure
;;; used in an apply node.
((if (eqv? (mod (input test) 2) 0)
     (lambda (x) (cons "EVEN" (cons x '())))
     (lambda (x) (cons "ODD" (cons x '()))))
 (input test))
